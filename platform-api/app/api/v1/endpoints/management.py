"""Administrative operations use a dedicated, database-verified role dependency."""
import re
from uuid import UUID
from decimal import Decimal
from fastapi import APIRouter, HTTPException, Query
from fastapi.encoders import jsonable_encoder
from sqlalchemy import select, func, or_
from app.api.deps import DatabaseDep, AdminDep
from app.models import User, Audiobook, GenerationJob
from app.models.platform import (Channel, PublisherApplication, Setting, Plan, Order, Audit,
    Report, Withdrawal, FinancialSnapshot, Ledger, PaymentEvent)
from app.schemas.platform import Decision, PlanInput, PolicyInput, AdjustmentInput
from app.models.platform import FinancialAdjustment
from app.schemas.user import UserRead
from app.services.policy import audit, configuration, month_now
from app.services import billing
from app.services.notification_service import deliver, notify

router = APIRouter()

def record(row):
    return jsonable_encoder({c.name: getattr(row, c.name) for c in row.__table__.columns})

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
        ("reports", Report, Report.status == "open"),
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
        ("audiobooks", Audiobook, []), ("open_reports", Report, [Report.status == "open"]),
        ("queued_jobs", GenerationJob, [GenerationJob.status == "PENDING", GenerationJob.cancelled.is_(False)])]:
        result[name] = await db.scalar(select(func.count()).select_from(model).where(*conditions))
    return result

@router.get("/users")
async def users(db: DatabaseDep, admin: AdminDep, q: str = "", account_type: str | None = None,
                suspended: bool | None = None, page: int = Query(1, ge=1)):
    matches = [User.email.ilike(f"%{q}%"), User.username.ilike(f"%{q}%")]
    number = re.fullmatch(r"[uU]?-?0*(\d{1,9})", q.strip())
    if number:
        matches.append(User.serial == int(number.group(1)))
    query = select(User).where(or_(*matches))
    if account_type == "publisher":
        # Publishers are users with an active publisher verification.
        query = query.where(User.account_type == "user", User.publisher_status == "active")
    elif account_type:
        query = query.where(User.account_type == account_type)
    if suspended is not None:
        query = query.where(User.suspended == suspended)
    return [UserRead.model_validate(u) for u in (await db.scalars(query.order_by(User.created_at.desc()).offset((page-1)*50).limit(50))).all()]

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
async def applications(db: DatabaseDep, admin: AdminDep, page: int = Query(1, ge=1)):
    rows = (await db.scalars(select(PublisherApplication).order_by(PublisherApplication.created_at.desc()).offset((page-1)*50).limit(50))).all()
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
                        "নিবন্ধন ফি পরিশোধ করে আপনার প্রকাশক অ্যাকাউন্ট চালু করুন।")
    else:
        notice = notify(db, user.id, "publisher.rejected", "প্রকাশক আবেদন বাতিল হয়েছে",
                        f"কারণ: {data.reason}")
    await db.commit()
    await deliver(db, [notice])
    return record(row)

@router.get("/audiobooks")
async def books(db: DatabaseDep, admin: AdminDep, q: str = "", page: int = Query(1, ge=1)):
    return [record(r) for r in (await db.scalars(select(Audiobook).where(Audiobook.title.ilike(f"%{q}%")).order_by(Audiobook.created_at.desc()).offset((page-1)*50).limit(50))).all()]

@router.get("/channels")
async def channels(db: DatabaseDep, admin: AdminDep, page: int = Query(1, ge=1)):
    return [record(r) for r in (await db.scalars(select(Channel).order_by(Channel.created_at.desc()).offset((page-1)*50).limit(50))).all()]

@router.post("/moderation/{kind}/{id}")
async def moderate(kind: str, id: UUID, data: Decision, db: DatabaseDep, admin: AdminDep):
    model = {"audiobooks": Audiobook, "channels": Channel}.get(kind)
    if not model or data.action not in {"restrict", "restore"}:
        raise HTTPException(400, "Invalid moderation action")
    row = await db.get(model, id)
    if not row:
        raise HTTPException(404, "Content not found")
    row.moderated = data.action == "restrict"
    audit(db, admin, f"{kind}.{data.action}", id, reason=data.reason)
    owner_id = row.owner_id
    label = getattr(row, "title", None) or getattr(row, "name", "")
    body = f"«{label}»" + (f"। কারণ: {data.reason}" if data.reason else "")
    notice = notify(db, owner_id, f"moderation.{data.action}",
                    "কনটেন্ট সীমিত করা হয়েছে" if data.action == "restrict" else "কনটেন্ট পুনরায় চালু হয়েছে", body)
    await db.commit()
    await deliver(db, [notice])
    return record(row)

@router.get("/reports")
async def reports(db: DatabaseDep, admin: AdminDep, page: int = Query(1, ge=1)):
    return [record(r) for r in (await db.scalars(select(Report).order_by(Report.created_at.desc()).offset((page-1)*50).limit(50))).all()]

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

@router.get("/payments")
async def payments(db: DatabaseDep, admin: AdminDep, page: int = Query(1, ge=1)):
    return [record(r) for r in (await db.scalars(select(Order).order_by(Order.created_at.desc()).offset((page-1)*50).limit(50))).all()]

@router.get("/finance")
async def finance(db: DatabaseDep, admin: AdminDep):
    async def total(model, column, *where):
        return str(await db.scalar(select(func.coalesce(func.sum(column), 0)).where(*where)))
    subscription = await total(Order, Order.amount, Order.kind == "subscription", Order.status == "success")
    fees = await total(Order, Order.amount, Order.kind == "publisher_registration", Order.status == "success")
    allocated = await total(Ledger, Ledger.amount, Ledger.kind == "earning")
    paid = await total(Withdrawal, Withdrawal.amount, Withdrawal.status == "completed")
    pool = await total(FinancialSnapshot, FinancialSnapshot.publisher_pool)
    share = await total(FinancialSnapshot, FinancialSnapshot.platform_share)
    closed = await total(FinancialSnapshot, FinancialSnapshot.revenue)
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
async def withdrawals(db: DatabaseDep, admin: AdminDep, page: int = Query(1, ge=1)):
    rows = (await db.scalars(select(Withdrawal).order_by(Withdrawal.created_at.desc()).offset((page-1)*50).limit(50))).all()
    return await with_member_numbers(db, rows, "publisher_id")

@router.post("/withdrawals/{id}/decision")
async def withdrawal_decision(id: UUID, data: Decision, db: DatabaseDep, admin: AdminDep):
    row = await db.scalar(select(Withdrawal).where(Withdrawal.id == id).with_for_update())
    if not row:
        raise HTTPException(404, "Withdrawal not found")
    transitions = {("pending", "approve"): "approved", ("pending", "reject"): "rejected", ("approved", "complete"): "completed"}
    target = transitions.get((row.status, data.action))
    if not target:
        raise HTTPException(409, "Invalid withdrawal transition")
    row.status, row.reason = target, data.reason
    if target == "completed":
        # Internal simulated ledger settlement only. No external transfer is made.
        db.add(Ledger(publisher_id=row.publisher_id, month=month_now(), amount=-row.amount,
                      kind="withdrawal", reference=f"withdrawal:{row.id}"))
    audit(db, admin, "withdrawal." + data.action, id, reason=data.reason, simulated=True)
    titles = {"approved": "উত্তোলন অনুমোদিত", "rejected": "উত্তোলন বাতিল", "completed": "উত্তোলন সম্পন্ন"}
    body = f"৳{row.amount}" + (f"। কারণ: {data.reason}" if target == "rejected" and data.reason else "")
    notice = notify(db, row.publisher_id, f"withdrawal.{target}", titles[target], body)
    await db.commit()
    await deliver(db, [notice])
    return record(row)

@router.get("/audit")
async def history(db: DatabaseDep, admin: AdminDep, page: int = Query(1, ge=1)):
    return [record(r) for r in (await db.scalars(select(Audit).order_by(Audit.created_at.desc()).offset((page-1)*50).limit(50))).all()]
