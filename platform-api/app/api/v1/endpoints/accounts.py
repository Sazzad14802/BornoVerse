from uuid import UUID
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from sqlalchemy import delete, select, func
from app.api.deps import DatabaseDep, MemberDep, ActivePublisherDep
from app.models import User, Audiobook, PlaybackProgress
from app.models.platform import (PublisherApplication, Channel, Plan, Order, Withdrawal, Ledger,
    EligibleView, Report, Playlist, PlaylistBook, Quota)
from app.schemas.platform import ChannelInput, OrderInput, CallbackInput, WithdrawalInput, ReportInput, ProfileInput
from app.schemas.user import UserRead
from app.services.policy import audit, configuration, is_publisher, month_now, premium
from app.services.storage_service import get_storage_service
from app.services.audiobook_service import get_audiobook_for_user
from app.services import billing
from app.api.v1.endpoints.management import record

router = APIRouter()

@router.get("/catalog/publishers")
async def public_publishers(db: DatabaseDep):
    users = (await db.scalars(select(User).where(User.account_type == "user",
        User.publisher_status == "active", User.suspended.is_(False)).order_by(User.username).limit(100))).all()
    return [{"id": str(u.id), "name": u.full_name or u.username} for u in users]

@router.get("/catalog/channels")
async def public_channels(db: DatabaseDep):
    rows = (await db.scalars(select(Channel).join(User, User.id == Channel.owner_id).where(
        Channel.moderated.is_(False), User.suspended.is_(False), User.publisher_status == "active",
        User.account_type == "user").order_by(Channel.name).limit(100))).all()
    return [{"id": str(c.id), "name": c.name, "publisher_id": str(c.owner_id)} for c in rows]

@router.post("/generation/{id}/cancel")
async def generation_cancel(id: UUID, db: DatabaseDep, user: MemberDep):
    from app.models import GenerationJob, AudiobookStatus
    row = await db.scalar(select(GenerationJob).where(GenerationJob.id == id, GenerationJob.owner_id == user.id).with_for_update())
    if not row:
        raise HTTPException(404, "Generation request not found")
    if row.status == AudiobookStatus.COMPLETED:
        raise HTTPException(409, "Completed jobs cannot be cancelled")
    row.cancelled, row.lease_token = True, None
    row.status = AudiobookStatus.FAILED
    row.error_message = "Cancelled by owner"
    book = await db.get(Audiobook, row.audiobook_id)
    book.status = AudiobookStatus.FAILED
    await db.commit()
    return record(row)

@router.post("/generation/{id}/retry")
async def generation_retry(id: UUID, db: DatabaseDep, user: MemberDep):
    from app.models import GenerationJob, AudiobookStatus
    row = await db.scalar(select(GenerationJob).where(GenerationJob.id == id, GenerationJob.owner_id == user.id).with_for_update())
    if not row:
        raise HTTPException(404, "Generation request not found")
    policy = await configuration(db)
    if row.status != AudiobookStatus.FAILED or row.cancelled or row.attempts >= policy["max_attempts"]:
        raise HTTPException(409, "Retry is unavailable for this request")
    row.status, row.available_at, row.error_message = AudiobookStatus.PENDING, None, None
    book = await db.get(Audiobook, row.audiobook_id)
    book.status = AudiobookStatus.PENDING
    await db.commit()
    return record(row)

@router.patch("/users/me")
async def profile(data: ProfileInput, db: DatabaseDep, user: MemberDep):
    user.full_name = data.full_name
    await db.commit()
    return UserRead.model_validate(user)

@router.get("/publisher/applications")
async def applications(db: DatabaseDep, user: MemberDep):
    return [record(r) for r in (await db.scalars(select(PublisherApplication).where(PublisherApplication.user_id == user.id).order_by(PublisherApplication.created_at.desc()))).all()]

@router.post("/publisher/applications")
async def apply(db: DatabaseDep, user: MemberDep, legal_name: str = Form(..., min_length=2, max_length=150), file: UploadFile = File(...)):
    await db.execute(select(User).where(User.id == user.id).with_for_update())
    if user.publisher_status not in {"none", "pending_approval", "rejected"}:
        raise HTTPException(409, "Application has already been approved")
    pending = await db.scalar(select(PublisherApplication.id).where(PublisherApplication.user_id == user.id, PublisherApplication.status == "pending"))
    if pending:
        raise HTTPException(409, "An application is already awaiting review")
    key = await get_storage_service().save_upload_file(file, "verification")
    row = PublisherApplication(user_id=user.id, legal_name=legal_name, document_key=key)
    db.add(row)
    user.publisher_status = "pending_approval"
    await db.flush()
    audit(db, user, "application.submit", row.id)
    await db.commit()
    return record(row)

@router.get("/publisher/registration-fee")
async def registration_fee(db: DatabaseDep, user: MemberDep):
    """The one-time publisher fee in BDT, as charged by POST /payments."""
    return {"amount": str((await configuration(db))["publisher_fee"]), "currency": "BDT"}

@router.get("/publisher/channels")
async def channels(db: DatabaseDep, user: MemberDep):
    return [record(r) for r in (await db.scalars(select(Channel).where(Channel.owner_id == user.id))).all()]

@router.post("/publisher/channels")
async def channel_create(data: ChannelInput, db: DatabaseDep, user: ActivePublisherDep):
    row = Channel(owner_id=user.id, **data.model_dump())
    db.add(row)
    await db.commit()
    return record(row)

@router.put("/publisher/channels/{id}")
async def channel_update(id: UUID, data: ChannelInput, db: DatabaseDep, user: ActivePublisherDep):
    row = await db.get(Channel, id)
    if not row or row.owner_id != user.id:
        raise HTTPException(404, "Channel not found")
    row.name, row.description = data.name, data.description
    await db.commit()
    return record(row)

@router.get("/subscriptions/plans")
async def plans(db: DatabaseDep):
    return [record(r) for r in (await db.scalars(select(Plan).where(Plan.active.is_(True)).order_by(Plan.months))).all()]

@router.post("/subscriptions/cancel")
async def cancel_subscription(db: DatabaseDep, user: MemberDep):
    user.subscription_cancelled = True
    audit(db, user, "subscription.cancel", user.id)
    await db.commit()
    return {"message": "No automatic renewals. Access remains until the paid expiry date.", "premium_until": user.premium_until}

@router.get("/payments")
async def payments(db: DatabaseDep, user: MemberDep):
    """Payment history: completed payments only. An unfinished or failed attempt
    is abandoned; paying again starts a new order."""
    rows = await db.scalars(select(Order).where(Order.user_id == user.id, Order.status == "success")
                            .order_by(Order.created_at.desc()).limit(100))
    return [record(r) for r in rows.all()]

@router.post("/payments")
async def initiate(data: OrderInput, db: DatabaseDep, user: MemberDep):
    return record(await billing.initiate(db, user, data))

@router.post("/payments/{id}/mock-confirm")
async def confirm(id: UUID, data: CallbackInput, db: DatabaseDep, user: MemberDep):
    return record(await billing.confirm(db, user, id, data.status))

@router.get("/publisher/dashboard")
async def dashboard(db: DatabaseDep, user: ActivePublisherDep):
    ledger = (await db.scalars(select(Ledger).where(Ledger.publisher_id == user.id).order_by(Ledger.created_at.desc()))).all()
    withdrawals = (await db.scalars(select(Withdrawal).where(Withdrawal.publisher_id == user.id).order_by(Withdrawal.created_at.desc()))).all()
    return {"available_balance": str(await billing.balance(db, user.id)),
        "eligible_views": await db.scalar(select(func.count()).select_from(EligibleView).where(EligibleView.publisher_id == user.id, EligibleView.month == month_now())),
        "audiobooks": await db.scalar(select(func.count()).select_from(Audiobook).where(Audiobook.owner_id == user.id)),
        "ledger": [record(r) for r in ledger], "withdrawals": [record(r) for r in withdrawals]}

@router.post("/publisher/withdrawals")
async def withdrawal(data: WithdrawalInput, db: DatabaseDep, user: ActivePublisherDep):
    await db.execute(select(User).where(User.id == user.id).with_for_update())
    if data.amount > await billing.balance(db, user.id):
        raise HTTPException(409, "Insufficient available balance")
    row = Withdrawal(publisher_id=user.id, **data.model_dump())
    db.add(row)
    await db.flush()
    audit(db, user, "withdrawal.request", row.id, amount=str(data.amount))
    await db.commit()
    return record(row)

@router.get("/generation/quota")
async def quota(db: DatabaseDep, user: MemberDep):
    policy = await configuration(db)
    tier = "publisher" if is_publisher(user) else "premium" if premium(user) else "free"
    row = await db.get(Quota, (user.id, month_now()))
    return {"used": row.used if row else 0, "limit": policy[tier + "_quota"], "plan": tier, "month": month_now()}

@router.post("/reports")
async def report(data: ReportInput, db: DatabaseDep, user: MemberDep):
    await get_audiobook_for_user(db, data.audiobook_id, user)
    row = Report(user_id=user.id, **data.model_dump())
    db.add(row)
    await db.commit()
    return record(row)

@router.get("/history")
async def history(db: DatabaseDep, user: MemberDep):
    return [record(r) for r in (await db.scalars(select(PlaybackProgress).where(PlaybackProgress.user_id == user.id).order_by(PlaybackProgress.updated_at.desc()).limit(100))).all()]

@router.get("/playlists")
async def playlists(db: DatabaseDep, user: MemberDep):
    return [record(r) for r in (await db.scalars(select(Playlist).where(Playlist.user_id == user.id))).all()]

@router.post("/playlists")
async def playlist_create(data: ChannelInput, db: DatabaseDep, user: MemberDep):
    row = Playlist(user_id=user.id, name=data.name)
    db.add(row)
    await db.commit()
    return record(row)

async def owned_playlist(db, id, user):
    row = await db.get(Playlist, id)
    if not row or row.user_id != user.id:
        raise HTTPException(404, "Playlist not found")
    return row

@router.delete("/playlists/{id}")
async def playlist_delete(id: UUID, db: DatabaseDep, user: MemberDep):
    row = await owned_playlist(db, id, user)
    await db.execute(delete(PlaylistBook).where(PlaylistBook.playlist_id == id))
    await db.delete(row)
    await db.commit()
    return {"removed": True}

@router.get("/playlists/{id}/books")
async def playlist_books(id: UUID, db: DatabaseDep, user: MemberDep):
    await owned_playlist(db, id, user)
    ids = (await db.scalars(select(PlaylistBook.audiobook_id).where(PlaylistBook.playlist_id == id))).all()
    result = []
    for book_id in ids:
        try:
            result.append(record(await get_audiobook_for_user(db, book_id, user)))
        except HTTPException as exc:
            if exc.status_code != 404:
                raise
    return result

@router.put("/playlists/{id}/books/{book_id}")
async def playlist_add(id: UUID, book_id: UUID, db: DatabaseDep, user: MemberDep):
    await owned_playlist(db, id, user)
    await get_audiobook_for_user(db, book_id, user)
    if not await db.get(PlaylistBook, (id, book_id)):
        db.add(PlaylistBook(playlist_id=id, audiobook_id=book_id))
        await db.commit()
    return {"saved": True}

@router.delete("/playlists/{id}/books/{book_id}")
async def playlist_remove(id: UUID, book_id: UUID, db: DatabaseDep, user: MemberDep):
    await owned_playlist(db, id, user)
    row = await db.get(PlaylistBook, (id, book_id))
    if row:
        await db.delete(row)
        await db.commit()
    return {"removed": True}
