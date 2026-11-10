"""Administrative operations use a dedicated, database-verified role dependency."""
import re
from datetime import datetime, timezone
from uuid import UUID
from decimal import Decimal
from fastapi import APIRouter, HTTPException, Query
from fastapi.encoders import jsonable_encoder
from sqlalchemy import select, func, or_
from app.api.deps import DatabaseDep, AdminDep
from app.models import User, Audiobook, GenerationJob
from app.models.platform import (Channel, PublisherApplication, Setting, Plan, Order, Audit,
    Report, Withdrawal, FinancialSnapshot, Ledger, PaymentEvent)
from app.schemas.platform import Decision, PlanInput, PolicyInput, AdjustmentInput, WithdrawalDecision
from app.models.platform import FinancialAdjustment
from app.models.moderation import ContentAppeal
from app.schemas.user import UserRead
from app.services.policy import audit, configuration, month_now
from app.services import billing, moderation_service
from app.services.notification_service import deliver, notify

router = APIRouter()
PAGE = 50

def record(row):
    return jsonable_encoder({c.name: getattr(row, c.name) for c in row.__table__.columns})

def date_range(column, date_from: str | None, date_to: str | None) -> list:
    """Conditions for an inclusive calendar-date range (YYYY-MM-DD, Asia/Dhaka) on a timestamp column."""
    from datetime import timedelta
    from zoneinfo import ZoneInfo
    conditions = []
    for value, upper in ((date_from, False), (date_to, True)):
        if not value:
            continue
        try:
            day = datetime.strptime(value, "%Y-%m-%d").replace(tzinfo=ZoneInfo("Asia/Dhaka"))
        except ValueError:
            raise HTTPException(422, "Dates must look like 2026-11-10")
        conditions.append(column < day + timedelta(days=1) if upper else column >= day)
    return conditions

def serial_number(q: str, prefix: str) -> int | None:
    """'U-0012', 'u12', '12' -> 12 (the prefix letter is optional)."""
    match = re.fullmatch(rf"(?:{prefix})?-?0*(\d{{1,9}})", q.strip(), re.IGNORECASE)
    return int(match.group(1)) if match else None

def member_conditions(q: str) -> list:
    """Match a member by username, email or member number."""
    matches = [User.email.ilike(f"%{q}%"), User.username.ilike(f"%{q}%")]
    number = serial_number(q, "u")
    if number is not None:
        matches.append(User.serial == number)
    return matches

async def people(db, ids) -> dict:
    ids = {i for i in ids if i}
    if not ids:
        return {}
    rows = (await db.execute(select(User.id, User.serial, User.username, User.email).where(User.id.in_(ids)))).all()
    return {r.id: {"id": str(r.id), "serial": r.serial, "username": r.username, "email": r.email} for r in rows}

def ordering(column, sort: str):
    return column.asc() if sort == "oldest" else column.desc()

async def with_member_numbers(db, rows, key: str):
    """Records plus the member number (serial) of the user referenced by `key`."""
    ids = {getattr(r, key) for r in rows}
    serials = dict((await db.execute(select(User.id, User.serial).where(User.id.in_(ids)))).all()) if ids else {}
    return [{**record(r), "member": serials.get(getattr(r, key))} for r in rows]

@router.get("/attention")
async def attention(db: DatabaseDep, admin: AdminDep):
    """Work waiting for an administrator, per section (drives the sidebar badges)."""
    counts = {}
    for name, model, condition in [
        ("applications", PublisherApplication, PublisherApplication.status == "pending"),
        ("reports", Report, Report.status.in_(("pending", "under_review"))),
        ("appeals", ContentAppeal, ContentAppeal.status == "pending"),
        ("withdrawals", Withdrawal, Withdrawal.status == "pending")]:
        counts[name] = await db.scalar(select(func.count()).select_from(model).where(condition))
    return counts

@router.get("/summary")
async def summary(db: DatabaseDep, admin: AdminDep):
    result = {}
    for name, model, conditions in [
        ("users", User, [User.account_type == "user"]),
        ("verified_publishers", User, [User.account_type == "user", User.publisher_status == "active"]),
        ("pending_applications", PublisherApplication, [PublisherApplication.status == "pending"]),
        ("audiobooks", Audiobook, []), ("open_reports", Report, [Report.status.in_(("pending", "under_review"))]),
        ("queued_jobs", GenerationJob, [GenerationJob.status == "PENDING", GenerationJob.cancelled.is_(False)])]:
        result[name] = await db.scalar(select(func.count()).select_from(model).where(*conditions))
    return result

@router.get("/users")
async def users(db: DatabaseDep, admin: AdminDep, q: str = "", account_type: str | None = None,
                suspended: bool | None = None, publisher_status: str | None = None, premium: bool | None = None,
                published: bool | None = None, date_from: str | None = None, date_to: str | None = None,
                sort: str = "newest", page: int = Query(1, ge=1)):
    query = select(User).where(or_(*member_conditions(q)), *date_range(User.created_at, date_from, date_to))
    if account_type == "publisher":
        # Publishers are users with an active publisher verification.
        query = query.where(User.account_type == "user", User.publisher_status == "active")
    elif account_type:
        query = query.where(User.account_type == account_type)
    if suspended is not None:
        query = query.where(User.suspended == suspended)
    if publisher_status:
        query = query.where(User.publisher_status == publisher_status)
    if premium is not None:
        active = User.premium_until > datetime.now(timezone.utc)
        query = query.where(active if premium else or_(User.premium_until.is_(None), ~active))
    if published is not None:
        owners = select(Audiobook.owner_id).where(Audiobook.publication_status == "published")
        query = query.where(User.id.in_(owners) if published else User.id.not_in(owners))
    order = User.username.asc() if sort == "username" else ordering(User.created_at, sort)
    rows = (await db.scalars(query.order_by(order).offset((page-1)*PAGE).limit(PAGE))).all()
    books = dict((await db.execute(select(Audiobook.owner_id, func.count()).where(
        Audiobook.owner_id.in_([u.id for u in rows]), Audiobook.publication_status == "published")
        .group_by(Audiobook.owner_id))).all()) if rows else {}
    now = datetime.now(timezone.utc)
    return [{**UserRead.model_validate(u).model_dump(mode="json"), "published_books": books.get(u.id, 0),
             "premium": bool(u.premium_until and billing.utc(u.premium_until) > now)} for u in rows]

@router.post("/users/{id}/decision")
async def user_decision(id: UUID, data: Decision, db: DatabaseDep, admin: AdminDep):
    user = await db.scalar(select(User).where(User.id == id).with_for_update())
    if not user:
        raise HTTPException(404, "User not found")
    if user.account_type == "admin" or data.action not in {"suspend", "unsuspend"}:
        raise HTTPException(400, "Only user suspension changes are supported")
    user.suspended = data.action == "suspend"
    user.token_version += 1
    audit(db, admin, "user." + data.action, id, reason=data.reason)
    await db.commit()
    return UserRead.model_validate(user)

@router.get("/applications")
async def applications(db: DatabaseDep, admin: AdminDep, q: str = "", status: str = "", date_from: str | None = None,
                       date_to: str | None = None, sort: str = "newest", page: int = Query(1, ge=1)):
    query = select(PublisherApplication).where(*date_range(PublisherApplication.created_at, date_from, date_to))
    if status:
        query = query.where(PublisherApplication.status == status)
    if q.strip():
        query = query.where(or_(PublisherApplication.legal_name.ilike(f"%{q}%"),
                                PublisherApplication.user_id.in_(select(User.id).where(or_(*member_conditions(q))))))
    rows = (await db.scalars(query.order_by(ordering(PublisherApplication.created_at, sort))
                             .offset((page-1)*PAGE).limit(PAGE))).all()
    return await with_member_numbers(db, rows, "user_id")

@router.get("/applications/{id}/document")
async def application_document(id: UUID, db: DatabaseDep, admin: AdminDep):
    from fastapi.responses import FileResponse
    from app.services.storage_service import get_storage_service
    row = await db.get(PublisherApplication, id)
    path = await get_storage_service().get_file_path(row.document_key) if row else None
    if not path:
        raise HTTPException(404, "Document not found")
    audit(db, admin, "application.view_document", id)
    await db.commit()
    return FileResponse(path, media_type="application/pdf", headers={"Cache-Control": "no-store"})

@router.post("/applications/{id}/decision")
async def application_decision(id: UUID, data: Decision, db: DatabaseDep, admin: AdminDep):
    row = await db.scalar(select(PublisherApplication).where(PublisherApplication.id == id).with_for_update())
    if not row:
        raise HTTPException(404, "Application not found")
    if row.status != "pending" or data.action not in {"approve", "reject"}:
        raise HTTPException(409, "Only pending applications can be approved or rejected")
    user = await db.scalar(select(User).where(User.id == row.user_id).with_for_update())
    row.status = "approved" if data.action == "approve" else "rejected"
    row.reason = data.reason
    user.publisher_status = "approved_pending_payment" if data.action == "approve" else "rejected"
    audit(db, admin, "application." + data.action, id, reason=data.reason)
    if data.action == "approve":
        notice = notify(db, user.id, "publisher.approved", "প্রকাশক আবেদন অনুমোদিত",
                        "নিবন্ধন ফি পরিশোধ করে আপনার প্রকাশক অ্যাকাউন্ট চালু করুন।",
                        en=("Publisher application approved", "Pay the registration fee to activate your publisher account."))
    else:
        notice = notify(db, user.id, "publisher.rejected", "প্রকাশক আবেদন বাতিল হয়েছে",
                        f"কারণ: {data.reason}", en=("Publisher application rejected", f"Reason: {data.reason}"))
    await db.commit()
    await deliver(db, [notice])
    return record(row)

@router.get("/audiobooks")
async def books(db: DatabaseDep, admin: AdminDep, q: str = "", owner: str = "", access_tier: str = "",
                status: str = "", publication_status: str = "", visibility: str = "", moderated: bool | None = None,
                language: str = "", in_channel: bool | None = None, date_from: str | None = None,
                date_to: str | None = None, sort: str = "newest", page: int = Query(1, ge=1)):
    query = select(Audiobook).where(*date_range(Audiobook.created_at, date_from, date_to))
    if q.strip():
        query = query.where(or_(Audiobook.title.ilike(f"%{q}%"), Audiobook.author.ilike(f"%{q}%")))
    if owner.strip():
        query = query.where(Audiobook.owner_id.in_(select(User.id).where(or_(*member_conditions(owner)))))
    for column, value in ((Audiobook.access_tier, access_tier), (Audiobook.publication_status, publication_status),
                          (Audiobook.language, language)):
        if value:
            query = query.where(column == value)
    from app.models import AudiobookStatus, AudiobookVisibility
    try:
        if status:
            query = query.where(Audiobook.status == AudiobookStatus(status))
        if visibility:
            query = query.where(Audiobook.visibility == AudiobookVisibility(visibility))
    except ValueError:
        raise HTTPException(422, "Unknown status or visibility")
    if moderated is not None:
        query = query.where(Audiobook.moderated == moderated)
    if in_channel is not None:
        query = query.where(Audiobook.channel_id.is_not(None) if in_channel else Audiobook.channel_id.is_(None))
    order = {"title": Audiobook.title.asc(), "longest": Audiobook.duration_seconds.desc()}.get(
        sort, ordering(Audiobook.created_at, sort))
    rows = (await db.scalars(query.order_by(order).offset((page-1)*PAGE).limit(PAGE))).all()
    owners = await people(db, [r.owner_id for r in rows])
    channel_ids = {r.channel_id for r in rows if r.channel_id}
    names = dict((await db.execute(select(Channel.id, Channel.name).where(Channel.id.in_(channel_ids)))).all()) if channel_ids else {}
    return [{**record(r), "owner": owners.get(r.owner_id), "channel_name": names.get(r.channel_id)} for r in rows]

@router.get("/channels")
async def channels(db: DatabaseDep, admin: AdminDep, q: str = "", owner: str = "", moderated: bool | None = None,
                   date_from: str | None = None, date_to: str | None = None, sort: str = "newest",
                   page: int = Query(1, ge=1)):
    from app.models.social import ChannelFollow
    query = select(Channel).where(*date_range(Channel.created_at, date_from, date_to))
    if q.strip():
        number = serial_number(q, "c")
        query = query.where(or_(Channel.name.ilike(f"%{q}%"), *([Channel.serial == number] if number is not None else [])))
    if owner.strip():
        query = query.where(Channel.owner_id.in_(select(User.id).where(or_(*member_conditions(owner)))))
    if moderated is not None:
        query = query.where(Channel.moderated == moderated)
    order = Channel.name.asc() if sort == "name" else ordering(Channel.created_at, sort)
    rows = (await db.scalars(query.order_by(order).offset((page-1)*PAGE).limit(PAGE))).all()
    ids = [r.id for r in rows]
    owners = await people(db, [r.owner_id for r in rows])
    followers = dict((await db.execute(select(ChannelFollow.channel_id, func.count()).where(
        ChannelFollow.channel_id.in_(ids)).group_by(ChannelFollow.channel_id))).all()) if ids else {}
    books = dict((await db.execute(select(Audiobook.channel_id, func.count()).where(
        Audiobook.channel_id.in_(ids)).group_by(Audiobook.channel_id))).all()) if ids else {}
    return [{**record(r), "owner": owners.get(r.owner_id), "followers": followers.get(r.id, 0),
             "audiobooks": books.get(r.id, 0)} for r in rows]

@router.post("/moderation/{kind}/{id}")
async def moderate(kind: str, id: UUID, data: Decision, db: DatabaseDep, admin: AdminDep):
    model = {"audiobooks": Audiobook, "channels": Channel}.get(kind)
    if not model or data.action not in {"restrict", "restore"}:
        raise HTTPException(400, "Invalid moderation action")
    row = await db.get(model, id)
    if not row:
        raise HTTPException(404, "Content not found")
    if kind == "audiobooks" and data.action == "restrict" and not row.moderated:
        # Hiding an audiobook opens a case: notice with the reason and a 7-day appeal.
        notice = await moderation_service.open_admin_case(db, admin, row, (data.reason or "").strip())
        audit(db, admin, f"{kind}.{data.action}", id, reason=data.reason)
        await db.commit()
        await deliver(db, [notice])
        return record(row)
    if kind == "audiobooks" and data.action == "restore":
        await moderation_service.close_cases_for_restore(db, admin, row, (data.reason or "").strip())
    row.moderated = data.action == "restrict"
    audit(db, admin, f"{kind}.{data.action}", id, reason=data.reason)
    owner_id = row.owner_id
    label = getattr(row, "title", None) or getattr(row, "name", "")
    body = f"«{label}»" + (f"। কারণ: {data.reason}" if data.reason else "")
    body_en = f"“{label}”" + (f". Reason: {data.reason}" if data.reason else "")
    notice = notify(db, owner_id, f"moderation.{data.action}",
                    "কনটেন্ট সীমিত করা হয়েছে" if data.action == "restrict" else "কনটেন্ট পুনরায় চালু হয়েছে", body,
                    en=("Content restricted" if data.action == "restrict" else "Content restored", body_en))
    await db.commit()
    await deliver(db, [notice])
    return record(row)

@router.post("/reports/{id}/decision")
async def report_decision(id: UUID, data: Decision, db: DatabaseDep, admin: AdminDep):
    row = await db.get(Report, id)
    if not row:
        raise HTTPException(404, "Report not found")
    if data.action not in {"resolve", "dismiss"}:
        raise HTTPException(400, "Invalid report decision")
    row.status, row.resolution = data.action, data.reason
    audit(db, admin, "report." + data.action, id, reason=data.reason)
    await db.commit()
    return record(row)

@router.get("/settings")
async def settings_get(db: DatabaseDep, admin: AdminDep):
    return await configuration(db)

@router.put("/settings")
async def settings_put(data: PolicyInput, db: DatabaseDep, admin: AdminDep):
    row = await db.get(Setting, "policy")
    before = await configuration(db)
    if not row:
        row = Setting(key="policy", value={})
        db.add(row)
    row.value = data.model_dump(mode="json")
    audit(db, admin, "settings.update", "policy", before=before, after=row.value)
    await db.commit()
    return row.value

@router.get("/plans")
async def plans(db: DatabaseDep, admin: AdminDep):
    return [record(r) for r in (await db.scalars(select(Plan).order_by(Plan.months))).all()]

@router.post("/plans")
async def plan_create(data: PlanInput, db: DatabaseDep, admin: AdminDep):
    row = Plan(**data.model_dump())
    db.add(row)
    await db.flush()
    audit(db, admin, "plan.create", row.id, value=data.model_dump(mode="json"))
    await db.commit()
    return record(row)

@router.put("/plans/{id}")
async def plan_update(id: UUID, data: PlanInput, db: DatabaseDep, admin: AdminDep):
    row = await db.get(Plan, id)
    if not row:
        raise HTTPException(404, "Plan not found")
    for key, value in data.model_dump().items():
        setattr(row, key, value)
    audit(db, admin, "plan.update", id, value=data.model_dump(mode="json"))
    await db.commit()
    return record(row)

def method_label(order: Order) -> str:
    """'BKASH-BKash' -> 'bKash'; mock and older orders fall back to the gateway name."""
    if order.method:
        name = order.method.split("-", 1)[-1].strip() or order.method
        return {"bkash": "bKash", "nagad": "Nagad", "rocket": "Rocket", "upay": "Upay"}.get(name.lower(), name)
    return {"mock": "Test payment", "sslcommerz": "SSLCommerz"}.get(order.provider, order.provider)

@router.get("/payments")
async def payments(db: DatabaseDep, admin: AdminDep, q: str = "", status: str = "", kind: str = "", method: str = "",
                   date_from: str | None = None, date_to: str | None = None, sort: str = "newest",
                   page: int = Query(1, ge=1)):
    query = select(Order).where(*date_range(Order.created_at, date_from, date_to))
    if q.strip():
        number = serial_number(q, "p")
        query = query.where(or_(Order.user_id.in_(select(User.id).where(or_(*member_conditions(q)))),
                                Order.gateway_session.ilike(f"%{q.strip()}%"),
                                *([Order.serial == number] if number is not None else [])))
    if status:
        query = query.where(Order.status == status)
    if kind:
        query = query.where(Order.kind == kind)
    if method:
        query = query.where(or_(Order.method.ilike(f"%{method}%"), Order.provider == method))
    order_by = {"amount": Order.amount.desc()}.get(sort, ordering(Order.created_at, sort))
    rows = (await db.scalars(query.order_by(order_by).offset((page-1)*PAGE).limit(PAGE))).all()
    buyers = await people(db, [r.user_id for r in rows])
    plan_ids = {r.plan_id for r in rows if r.plan_id}
    plans = dict((await db.execute(select(Plan.id, Plan.name).where(Plan.id.in_(plan_ids)))).all()) if plan_ids else {}
    return [{**record(r), "user": buyers.get(r.user_id), "plan_name": plans.get(r.plan_id),
             "method_label": method_label(r)} for r in rows]

@router.get("/payments/summary")
async def payments_summary(db: DatabaseDep, admin: AdminDep, date_from: str | None = None, date_to: str | None = None):
    """Totals for the payments page header, for the same date range."""
    where = date_range(Order.created_at, date_from, date_to)
    rows = (await db.execute(select(Order.status, func.count(), func.coalesce(func.sum(Order.amount), 0))
                             .where(*where).group_by(Order.status))).all()
    return {status: {"count": count, "amount": str(amount)} for status, count, amount in rows}

@router.get("/finance")
async def finance(db: DatabaseDep, admin: AdminDep):
    async def total(model, column, *where):
        return str(await db.scalar(select(func.coalesce(func.sum(column), 0)).where(*where)))
    subscription = await total(Order, Order.amount, Order.kind == "subscription", Order.status == "success")
    fees = await total(Order, Order.amount, Order.kind == "publisher_registration", Order.status == "success")
    allocated = await total(Ledger, Ledger.amount, Ledger.kind == "earning")
    paid = await total(Withdrawal, Withdrawal.amount, Withdrawal.status == "completed")
    from app.models.platform import DailyEarning
    pool = await total(FinancialSnapshot, FinancialSnapshot.publisher_pool)
    share = await total(FinancialSnapshot, FinancialSnapshot.platform_share)
    closed = await total(FinancialSnapshot, FinancialSnapshot.revenue)
    # Days already credited in months that are not closed yet.
    closed_months = set((await db.scalars(select(FinancialSnapshot.month))).all())
    open_days = [d for d in (await db.scalars(select(DailyEarning))).all() if d.day[:7] not in closed_months]
    pool = str(Decimal(pool) + sum((d.publisher_pool for d in open_days), Decimal(0)))
    share = str(Decimal(share) + sum((d.revenue - d.publisher_pool for d in open_days), Decimal(0)))
    closed = str(Decimal(closed) + sum((d.revenue for d in open_days), Decimal(0)))
    refunds = await total(FinancialAdjustment, FinancialAdjustment.amount, FinancialAdjustment.kind == "refund")
    adjustments = await total(FinancialAdjustment, FinancialAdjustment.amount, FinancialAdjustment.kind == "adjustment")
    subscription_deductions = await db.scalar(select(func.coalesce(func.sum(FinancialAdjustment.amount), 0)).join(
        Order, Order.id == FinancialAdjustment.order_id).where(Order.kind == "subscription"))
    return {"subscription_revenue": subscription, "registration_fees": fees, "allocated_payouts": allocated,
        "publisher_liabilities": str(Decimal(pool)-Decimal(paid)), "completed_withdrawals": paid,
        "unallocated_pool": str(Decimal(pool)-Decimal(allocated)), "platform_share": share,
        "unclosed_receipts": str(Decimal(subscription)-subscription_deductions-Decimal(closed)),
        "refunds": refunds,
        "adjustments": adjustments,
        "reconciliation_difference": str(Decimal(closed)-Decimal(pool)-Decimal(share)),
        "snapshots": [record(r) for r in (await db.scalars(select(FinancialSnapshot).order_by(FinancialSnapshot.month.desc()))).all()]}

@router.post("/finance/close/{month}")
async def close(month: str, db: DatabaseDep, admin: AdminDep):
    return record(await billing.close_month(db, admin, month))

@router.get("/finance/daily")
async def finance_daily(db: DatabaseDep, admin: AdminDep, date_from: str | None = None, date_to: str | None = None):
    """Daily earnings closes (newest first), optionally within a date range."""
    from app.models.platform import DailyEarning
    await billing.close_due_days(db)
    query = select(DailyEarning)
    if date_from:
        query = query.where(DailyEarning.day >= date_from)
    if date_to:
        query = query.where(DailyEarning.day <= date_to)
    return [record(r) for r in (await db.scalars(query.order_by(DailyEarning.day.desc()).limit(120))).all()]

@router.get("/adjustments")
async def adjustments(db: DatabaseDep, admin: AdminDep):
    return [record(r) for r in (await db.scalars(select(FinancialAdjustment).order_by(FinancialAdjustment.created_at.desc()).limit(100))).all()]

@router.post("/adjustments")
async def adjust(data: AdjustmentInput, db: DatabaseDep, admin: AdminDep):
    from zoneinfo import ZoneInfo
    from app.services.policy import utc
    billing.MockGateway().confirm("success")
    await db.execute(select(Setting).where(Setting.key == "policy").with_for_update())
    prior = await db.scalar(select(FinancialAdjustment).where(FinancialAdjustment.reference == data.reference))
    if prior:
        if prior.order_id != data.order_id or prior.amount != data.amount or prior.kind != data.kind:
            raise HTTPException(409, "Adjustment reference already used")
        return record(prior)
    order = await db.scalar(select(Order).where(Order.id == data.order_id).with_for_update())
    if not order or order.status != "success":
        raise HTTPException(409, "A confirmed order is required")
    month = utc(order.updated_at).astimezone(ZoneInfo("Asia/Dhaka")).strftime("%Y-%m")
    if await db.get(FinancialSnapshot, month):
        raise HTTPException(409, "Month is closed. A post-close accounting policy is required before adjustment")
    deducted = await db.scalar(select(func.coalesce(func.sum(FinancialAdjustment.amount),0)).where(FinancialAdjustment.order_id == order.id))
    if deducted + data.amount > order.amount:
        raise HTTPException(409, "Deductions cannot exceed the order amount")
    row = FinancialAdjustment(**data.model_dump(), month=month)
    db.add(row)
    await db.flush()
    audit(db, admin, "finance." + data.kind, row.id, reason=data.reason, amount=str(data.amount), order_id=str(order.id), simulated=True)
    await db.commit()
    return record(row)

@router.get("/withdrawals")
async def withdrawals(db: DatabaseDep, admin: AdminDep, q: str = "", status: str = "", method: str = "",
                      date_from: str | None = None, date_to: str | None = None, sort: str = "newest",
                      page: int = Query(1, ge=1)):
    query = select(Withdrawal).where(*date_range(Withdrawal.created_at, date_from, date_to))
    if status:
        query = query.where(Withdrawal.status == status)
    if method:
        query = query.where(Withdrawal.method == method)
    if q.strip():
        query = query.where(or_(Withdrawal.publisher_id.in_(select(User.id).where(or_(*member_conditions(q)))),
                                Withdrawal.account_number.ilike(f"%{q.strip()}%"),
                                Withdrawal.payout_reference.ilike(f"%{q.strip()}%")))
    rows = (await db.scalars(query.order_by(ordering(Withdrawal.created_at, sort)).offset((page-1)*PAGE).limit(PAGE))).all()
    publishers = await people(db, [r.publisher_id for r in rows])
    return [{**row, "publisher": publishers.get(r.publisher_id)}
            for r, row in zip(rows, await with_member_numbers(db, rows, "publisher_id"))]

@router.post("/withdrawals/{id}/decision")
async def withdrawal_decision(id: UUID, data: WithdrawalDecision, db: DatabaseDep, admin: AdminDep):
    row = await db.scalar(select(Withdrawal).where(Withdrawal.id == id).with_for_update())
    if not row:
        raise HTTPException(404, "Withdrawal not found")
    transitions = {("pending", "approve"): "approved", ("pending", "reject"): "rejected", ("approved", "complete"): "completed"}
    target = transitions.get((row.status, data.action))
    if not target:
        raise HTTPException(409, "Invalid withdrawal transition")
    row.status, row.reason = target, data.reason
    if target == "approved":
        row.scheduled_for = data.scheduled_for
    if target == "completed":
        row.payout_reference = data.payout_reference.strip()
        row.paid_at = data.paid_at or datetime.now(timezone.utc)
        row.payout_note = data.payout_note.strip()
        # Internal simulated ledger settlement only. No external transfer is made.
        db.add(Ledger(publisher_id=row.publisher_id, month=month_now(), amount=-row.amount,
                      kind="withdrawal", reference=f"withdrawal:{row.id}"))
    audit(db, admin, "withdrawal." + data.action, id, reason=data.reason, simulated=True)
    titles = {"approved": "উত্তোলন অনুমোদিত", "rejected": "উত্তোলন বাতিল", "completed": "উত্তোলন সম্পন্ন"}
    body = f"৳{row.amount}" + (f"। কারণ: {data.reason}" if target == "rejected" and data.reason else "")
    titles_en = {"approved": "Withdrawal approved", "rejected": "Withdrawal rejected", "completed": "Withdrawal completed"}
    body_en = f"BDT {row.amount}" + (f". Reason: {data.reason}" if target == "rejected" and data.reason else "")
    if target == "approved" and row.scheduled_for:
        body += f"। {row.scheduled_for:%d %b %Y}-এর মধ্যে পাঠানো হবে।"
        body_en += f" will be sent by {row.scheduled_for:%d %b %Y}."
    if target == "completed":
        body += f" {row.destination}-এ পাঠানো হয়েছে। রেফারেন্স: {row.payout_reference}"
        body_en += f" was sent to {row.destination}. Reference: {row.payout_reference}"
    notice = notify(db, row.publisher_id, f"withdrawal.{target}", titles[target], body, en=(titles_en[target], body_en))
    await db.commit()
    await deliver(db, [notice])
    return record(row)

@router.get("/audit")
async def history(db: DatabaseDep, admin: AdminDep, q: str = "", group: str = "", actor: str = "",
                  date_from: str | None = None, date_to: str | None = None, sort: str = "newest",
                  page: int = Query(1, ge=1)):
    """Audit entries with readable numbers (A-000001), the acting member and filters."""
    query = select(Audit).where(*date_range(Audit.created_at, date_from, date_to))
    if group:
        query = query.where(Audit.action.like(f"{group}.%"))
    if q.strip():
        number = serial_number(q, "a")
        query = query.where(or_(Audit.action.ilike(f"%{q.strip()}%"), Audit.target.ilike(f"%{q.strip()}%"),
                                *([Audit.serial == number] if number is not None else [])))
    if actor.strip():
        if actor.strip().lower() == "system":
            query = query.where(Audit.actor_id.is_(None))
        else:
            query = query.where(Audit.actor_id.in_(select(User.id).where(or_(*member_conditions(actor)))))
    rows = (await db.scalars(query.order_by(ordering(Audit.created_at, sort)).offset((page-1)*PAGE).limit(PAGE))).all()
    actors = await people(db, [r.actor_id for r in rows])
    # Targets are ids of many kinds; name the ones that are members.
    targets = {}
    for r in rows:
        try:
            targets[r.id] = UUID(r.target)
        except (ValueError, TypeError):
            pass
    members = await people(db, targets.values())
    return [{**record(r), "actor": actors.get(r.actor_id), "target_member": members.get(targets.get(r.id))}
            for r in rows]

@router.get("/audit/groups")
async def audit_groups(db: DatabaseDep, admin: AdminDep):
    """The action families present in the log (the part before the first dot), for the filter."""
    actions = (await db.scalars(select(Audit.action).distinct())).all()
    return sorted({a.split(".", 1)[0] for a in actions if a})
