"""Content reports, moderation cases, appeals and account records (see moderation_service)."""
from datetime import timedelta
from typing import Literal, Optional
from uuid import UUID

from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import func, or_, select

from app.api.deps import AdminDep, DatabaseDep, MemberDep
from app.models import Audiobook, User
from app.models.moderation import ContentAppeal, ModerationAction, ModerationEvidence, UserRestriction, UserStrike
from app.models.platform import Audit, Report
from app.services import moderation_service as mod
from app.services.audiobook_service import get_audiobook_for_user
from app.services.notification_service import deliver, notify
from app.services.policy import audit
from app.services.storage_service import get_storage_service

router = APIRouter()
admin_router = APIRouter()

Category = Literal["sexual_content", "copyright", "plagiarism", "fake_account", "illegal",
                   "harassment", "misleading", "other"]
AppealReason = Literal["own_rights", "have_permission", "original_work", "report_mistaken", "other"]
MAX_REPORT_FILES = 3
MAX_APPEAL_FILES = 5


def iso(value) -> Optional[str]:
    return value.isoformat() if value else None


async def person(db, user_id) -> Optional[dict]:
    user = await db.get(User, user_id) if user_id else None
    return {"id": str(user.id), "username": user.username, "name": user.full_name or user.username,
            "serial": user.serial} if user else None


async def add_evidence(db, file: UploadFile, uploader: User, *, report_id=None, appeal_id=None) -> dict:
    key, content_type = await get_storage_service().save_evidence(file)
    row = ModerationEvidence(report_id=report_id, appeal_id=appeal_id, uploaded_by=uploader.id, storage_key=key,
                             filename=(file.filename or "evidence")[:255], content_type=content_type)
    db.add(row)
    await db.commit()
    return {"id": str(row.id), "filename": row.filename, "content_type": row.content_type}


def evidence_rows(rows) -> list[dict]:
    return [{"id": str(e.id), "filename": e.filename, "content_type": e.content_type, "created_at": iso(e.created_at)}
            for e in rows]


# ── Listener: reporting ──────────────────────────────────────────────────────

class ReportInput(BaseModel):
    audiobook_id: UUID
    category: Category = "other"
    details: str = Field(default="", max_length=5000)
    # Older clients send a free-text reason only.
    reason: Optional[str] = Field(default=None, max_length=5000)

    @model_validator(mode="after")
    def explain_other(self):
        self.details = (self.details or self.reason or "").strip()
        if self.category == "other" and len(self.details) < 5:
            raise ValueError("Describe the problem when choosing Other")
        return self


@router.post("/reports")
async def create_report(data: ReportInput, db: DatabaseDep, user: MemberDep):
    book = await get_audiobook_for_user(db, data.audiobook_id, user)
    if book.owner_id == user.id:
        raise HTTPException(403, "You cannot report your own audiobook")
    if await db.scalar(select(Report.id).where(Report.user_id == user.id, Report.audiobook_id == book.id,
                                               Report.source == "listener")):
        raise HTTPException(409, "You have already reported this audiobook")
    recent = await db.scalar(select(func.count()).select_from(Report).where(
        Report.user_id == user.id, Report.created_at >= mod.now() - timedelta(days=1)))
    if recent >= mod.REPORTS_PER_DAY:
        raise HTTPException(429, "Too many reports today. Try again tomorrow.")
    label = mod.CATEGORIES[data.category][1]
    row = Report(user_id=user.id, audiobook_id=book.id, owner_id=book.owner_id, category=data.category,
                 details=data.details, reason=f"{label}: {data.details}" if data.details else label, status="pending")
    db.add(row)
    await db.flush()
    audit(db, user, "moderation.report.received", row.id, new_status="pending", category=data.category,
          audiobook_id=str(book.id))
    await db.commit()
    return {"id": str(row.id), "status": row.status, "category": row.category}


@router.post("/reports/{report_id}/evidence")
async def report_evidence(report_id: UUID, db: DatabaseDep, user: MemberDep, file: UploadFile = File(...)):
    report = await db.get(Report, report_id)
    if not report or report.user_id != user.id:
        raise HTTPException(404, "Report not found")
    if report.status not in mod.OPEN_STATUSES:
        raise HTTPException(409, "This report is already being handled")
    count = await db.scalar(select(func.count()).select_from(ModerationEvidence).where(ModerationEvidence.report_id == report.id))
    if count >= MAX_REPORT_FILES:
        raise HTTPException(409, f"At most {MAX_REPORT_FILES} files per report")
    return await add_evidence(db, file, user, report_id=report.id)


# ── Content owner: notices and appeals ───────────────────────────────────────

async def case_actions(db, report_id) -> list[dict]:
    rows = (await db.scalars(select(ModerationAction).where(ModerationAction.report_id == report_id)
                             .order_by(ModerationAction.created_at))).all()
    return [{"id": str(a.id), "kind": a.kind, "details": a.details, "created_at": iso(a.created_at),
             "reversed": a.reversed_at is not None} for a in rows]


@router.get("/me/moderation")
async def my_moderation(db: DatabaseDep, user: MemberDep):
    """Cases against the user's content (with actions, appeal and deadline) and account standing."""
    reports = (await db.scalars(select(Report).where(
        Report.owner_id == user.id, Report.status.in_(("action_taken", "appealed", "resolved")),
        Report.violation.is_not(None)).order_by(Report.updated_at.desc()))).all()
    cases = []
    for report in reports:
        book = await db.get(Audiobook, report.audiobook_id)
        appeal = await db.scalar(select(ContentAppeal).where(ContentAppeal.report_id == report.id))
        actions = [a for a in await case_actions(db, report.id) if a["kind"] != "flag"]  # flags are internal
        if not actions:
            continue
        deadline = mod.utc(report.appeal_deadline)
        cases.append({
            "report_id": str(report.id), "status": report.status, "violation": report.violation,
            "audiobook": {"id": str(report.audiobook_id), "title": book.title if book else ""},
            "actions": actions, "appeal_deadline": iso(deadline),
            "can_appeal": report.status == "action_taken" and not appeal and bool(deadline and deadline > mod.now()),
            "appeal": {"id": str(appeal.id), "status": appeal.status, "reason": appeal.reason,
                       "explanation": appeal.explanation, "decision_note": appeal.decision_note,
                       "created_at": iso(appeal.created_at)} if appeal else None,
            "updated_at": iso(report.updated_at),
        })
    restricted = mod.utc(user.publishing_restricted_until)
    return {"strikes": await mod.active_strikes(db, user.id),
            "publishing_restricted_until": iso(restricted) if restricted and restricted > mod.now() else None,
            "cases": cases}


class AppealInput(BaseModel):
    reason: AppealReason
    explanation: str = Field(min_length=10, max_length=5000)


@router.get("/me/appeals")
async def my_appeals(db: DatabaseDep, user: MemberDep):
    """Every appeal the user has made, newest first, with the case and decision."""
    rows = (await db.scalars(select(ContentAppeal).where(ContentAppeal.user_id == user.id)
                             .order_by(ContentAppeal.created_at.desc()))).all()
    result = []
    for a in rows:
        report = await db.get(Report, a.report_id)
        book = await db.get(Audiobook, report.audiobook_id) if report else None
        files = await db.scalar(select(func.count()).select_from(ModerationEvidence).where(
            ModerationEvidence.appeal_id == a.id))
        result.append({
            "id": str(a.id), "report_id": str(a.report_id), "status": a.status, "reason": a.reason,
            "explanation": a.explanation, "decision_note": a.decision_note, "created_at": iso(a.created_at),
            "decided_at": iso(a.decided_at), "files": files or 0,
            "violation": report.violation if report else None,
            "violation_label": mod.category_label(report.violation) if report else None,
            "case_status": report.status if report else None,
            "audiobook": {"id": str(book.id), "title": book.title} if book else None,
        })
    return result


@router.post("/moderation/cases/{report_id}/appeal")
async def appeal(report_id: UUID, data: AppealInput, db: DatabaseDep, user: MemberDep):
    report = await db.scalar(select(Report).where(Report.id == report_id).with_for_update())
    if not report or report.owner_id != user.id:
        raise HTTPException(404, "Case not found")
    if report.status != "action_taken":
        raise HTTPException(409, "This case cannot be appealed")
    if await db.scalar(select(ContentAppeal.id).where(ContentAppeal.report_id == report.id)):
        raise HTTPException(409, "You have already appealed this decision")
    deadline = mod.utc(report.appeal_deadline)
    if not deadline or deadline <= mod.now():
        raise HTTPException(409, "The appeal deadline has passed")
    row = ContentAppeal(report_id=report.id, user_id=user.id, reason=data.reason, explanation=data.explanation.strip())
    db.add(row)
    await db.flush()
    report.status = "appealed"
    audit(db, user, "moderation.appeal.submitted", report.id, previous_status="action_taken",
          new_status="appealed", appeal_id=str(row.id), reason=data.reason)
    await db.commit()
    return {"id": str(row.id), "status": row.status}


@router.post("/appeals/{appeal_id}/evidence")
async def appeal_evidence(appeal_id: UUID, db: DatabaseDep, user: MemberDep, file: UploadFile = File(...)):
    row = await db.get(ContentAppeal, appeal_id)
    if not row or row.user_id != user.id:
        raise HTTPException(404, "Appeal not found")
    if row.status != "pending":
        raise HTTPException(409, "This appeal has already been decided")
    count = await db.scalar(select(func.count()).select_from(ModerationEvidence).where(ModerationEvidence.appeal_id == row.id))
    if count >= MAX_APPEAL_FILES:
        raise HTTPException(409, f"At most {MAX_APPEAL_FILES} files per appeal")
    return await add_evidence(db, file, user, appeal_id=row.id)


# ── Admin: reports dashboard ────────────────────────────────────────────────

async def report_row(db, report: Report) -> dict:
    book = await db.get(Audiobook, report.audiobook_id)
    appeal = await db.scalar(select(ContentAppeal).where(ContentAppeal.report_id == report.id))
    owner = await person(db, report.owner_id or (book.owner_id if book else None))
    if owner:
        owner["strikes"] = await mod.active_strikes(db, UUID(owner["id"]))
    return {
        "id": str(report.id), "status": report.status, "category": report.category,
        "category_label": mod.CATEGORIES.get(report.category, mod.CATEGORIES["other"])[1],
        "details": report.details, "created_at": iso(report.created_at), "violation": report.violation,
        "appeal_deadline": iso(mod.utc(report.appeal_deadline)), "resolution": report.resolution,
        "reporter": await person(db, report.user_id), "owner": owner,
        "audiobook": {"id": str(book.id), "title": book.title, "author": book.author, "moderated": book.moderated,
                      "publication_status": book.publication_status, "access_tier": book.access_tier} if book else None,
        "same_content_reports": await db.scalar(select(func.count()).select_from(Report).where(
            Report.audiobook_id == report.audiobook_id)),
        "evidence_count": await db.scalar(select(func.count()).select_from(ModerationEvidence).where(
            ModerationEvidence.report_id == report.id)),
        "appeal_status": appeal.status if appeal else None,
    }


@admin_router.get("/reports")
async def list_reports(db: DatabaseDep, admin: AdminDep, status: str = "", page: int = Query(1, ge=1)):
    query = select(Report)
    if status == "open":
        query = query.where(Report.status.in_(mod.OPEN_STATUSES))
    elif status:
        query = query.where(Report.status == status)
    rows = (await db.scalars(query.order_by(Report.created_at.desc()).offset((page - 1) * 50).limit(50))).all()
    return [await report_row(db, r) for r in rows]


async def account_record(db, user_id: UUID) -> dict:
    user = await db.get(User, user_id)
    strikes = (await db.scalars(select(UserStrike).where(UserStrike.user_id == user_id).order_by(UserStrike.created_at.desc()))).all()
    restrictions = (await db.scalars(select(UserRestriction).where(UserRestriction.user_id == user_id)
                                     .order_by(UserRestriction.starts_at.desc()))).all()
    flags = (await db.scalars(select(ModerationAction).where(ModerationAction.target_user_id == user_id,
                                                             ModerationAction.kind == "flag")
                              .order_by(ModerationAction.created_at.desc()))).all()
    appeals = (await db.scalars(select(ContentAppeal).where(ContentAppeal.user_id == user_id)
                                .order_by(ContentAppeal.created_at.desc()))).all()
    cases = (await db.scalars(select(Report).where(Report.owner_id == user_id, Report.violation.is_not(None))
                              .order_by(Report.updated_at.desc()))).all()
    restricted = mod.utc(user.publishing_restricted_until) if user else None
    return {
        "user": await person(db, user_id),
        "status": "suspended" if user and user.suspended else "restricted" if restricted and restricted > mod.now() else "active",
        "permanently_banned": bool(user and user.suspended),
        "publishing_restricted_until": iso(restricted) if restricted and restricted > mod.now() else None,
        "active_strikes": sum(1 for s in strikes if not s.revoked_at),
        "strikes": [{"id": str(s.id), "violation": s.violation, "report_id": str(s.report_id),
                     "created_at": iso(s.created_at), "revoked": s.revoked_at is not None} for s in strikes],
        "restrictions": [{"id": str(r.id), "reason": r.reason, "starts_at": iso(r.starts_at), "ends_at": iso(r.ends_at),
                          "lifted": r.lifted_at is not None,
                          "active": r.lifted_at is None and (mod.utc(r.ends_at) or mod.PERMANENT) > mod.now()}
                         for r in restrictions],
        "flags": [{"id": str(f.id), "note": f.details.get("note", ""), "report_id": str(f.report_id),
                   "created_at": iso(f.created_at), "active": f.reversed_at is None} for f in flags],
        "appeals": [{"id": str(a.id), "status": a.status, "reason": a.reason, "created_at": iso(a.created_at)} for a in appeals],
        "violations": [{"report_id": str(c.id), "violation": c.violation, "status": c.status,
                        "updated_at": iso(c.updated_at)} for c in cases],
    }


@admin_router.get("/reports/{report_id}")
async def report_detail(report_id: UUID, db: DatabaseDep, admin: AdminDep):
    report = await db.get(Report, report_id)
    if not report:
        raise HTTPException(404, "Report not found")
    row = await report_row(db, report)
    row["evidence"] = evidence_rows((await db.scalars(select(ModerationEvidence).where(
        ModerationEvidence.report_id == report.id))).all())
    others = (await db.scalars(select(Report).where(Report.audiobook_id == report.audiobook_id, Report.id != report.id)
                               .order_by(Report.created_at.desc()))).all()
    row["other_reports"] = [{"id": str(o.id), "category": o.category, "details": o.details, "status": o.status,
                             "created_at": iso(o.created_at), "reporter": await person(db, o.user_id)} for o in others]
    row["actions"] = await case_actions(db, report.id)
    appeal = await db.scalar(select(ContentAppeal).where(ContentAppeal.report_id == report.id))
    row["appeal"] = {
        "id": str(appeal.id), "status": appeal.status, "reason": appeal.reason, "explanation": appeal.explanation,
        "decision_note": appeal.decision_note, "created_at": iso(appeal.created_at),
        "evidence": evidence_rows((await db.scalars(select(ModerationEvidence).where(
            ModerationEvidence.appeal_id == appeal.id))).all()),
    } if appeal else None
    row["owner_record"] = await account_record(db, UUID(row["owner"]["id"])) if row["owner"] else None
    # Reporter credibility: how many of their earlier reports were dismissed.
    row["reporter_dismissed_reports"] = await db.scalar(select(func.count()).select_from(Report).where(
        Report.user_id == report.user_id, Report.status == "dismissed"))
    targets = [str(report.id), str(report.audiobook_id)] + ([str(report.owner_id)] if report.owner_id else [])
    history = (await db.scalars(select(Audit).where(Audit.target.in_(targets), Audit.action.like("moderation.%"))
                                .order_by(Audit.created_at.desc()).limit(100))).all()
    row["history"] = [{"id": str(h.id), "action": h.action, "target": h.target, "details": h.details,
                       "created_at": iso(h.created_at), "actor": await person(db, h.actor_id)} for h in history]
    return row


async def open_report(db, report_id: UUID) -> Report:
    report = await db.scalar(select(Report).where(Report.id == report_id).with_for_update())
    if not report:
        raise HTTPException(404, "Report not found")
    return report


class NoteInput(BaseModel):
    note: str = Field(default="", max_length=2000)


@admin_router.post("/reports/{report_id}/review")
async def start_review(report_id: UUID, data: NoteInput, db: DatabaseDep, admin: AdminDep):
    report = await open_report(db, report_id)
    if report.status != "pending":
        raise HTTPException(409, "Only pending reports can be put under review")
    mod.set_status(db, admin, report, "under_review", data.note)
    await db.commit()
    return await report_row(db, report)


class ActionInput(BaseModel):
    violation: Category
    notify: bool = True
    hide: bool = False
    restrict_days: Optional[int] = Field(default=None, ge=1, le=365)
    flag_note: str = Field(default="", max_length=2000)
    message: str = Field(default="", max_length=2000)
    note: str = Field(default="", max_length=2000)


@admin_router.post("/reports/{report_id}/actions")
async def take_actions(report_id: UUID, data: ActionInput, db: DatabaseDep, admin: AdminDep):
    report = await open_report(db, report_id)
    notice = await mod.take_actions(db, admin, report, violation=data.violation, notify_owner=data.notify,
                                    hide=data.hide, restrict_days=data.restrict_days, flag_note=data.flag_note.strip(),
                                    message=data.message.strip(), note=data.note.strip())
    await db.commit()
    await deliver(db, [notice])
    return await report_row(db, report)


@admin_router.post("/reports/{report_id}/dismiss")
async def dismiss(report_id: UUID, data: NoteInput, db: DatabaseDep, admin: AdminDep):
    report = await open_report(db, report_id)
    if report.status not in mod.OPEN_STATUSES:
        raise HTTPException(409, "Only open reports can be dismissed")
    report.resolution = data.note or "No violation found"
    mod.set_status(db, admin, report, "dismissed", data.note)
    for other in await mod.siblings(db, report):
        other.resolution = report.resolution
        mod.set_status(db, admin, other, "dismissed", f"Dismissed with case {report.id}")
    await db.commit()
    return await report_row(db, report)


class ConfirmInput(BaseModel):
    delete_content: bool = False
    # Deleting needs an explicit second confirmation.
    confirm: str = ""
    note: str = Field(default="", max_length=2000)

    @model_validator(mode="after")
    def deletion_confirmed(self):
        if self.delete_content and self.confirm != "DELETE":
            raise ValueError('Type DELETE to confirm permanent deletion')
        return self


@admin_router.post("/reports/{report_id}/confirm")
async def confirm_violation(report_id: UUID, data: ConfirmInput, db: DatabaseDep, admin: AdminDep):
    """Close a case as a confirmed violation: when the appeal window passed without an
    appeal, or immediately for serious violations."""
    report = await open_report(db, report_id)
    if report.status == "appealed":
        raise HTTPException(409, "Decide the pending appeal instead")
    if not report.violation:
        report.violation = report.category
    notice = await mod.confirm_violation(db, admin, report, delete_content=data.delete_content, note=data.note.strip())
    await db.commit()
    await deliver(db, [notice])
    return await report_row(db, report)


# ── Admin: appeals ──────────────────────────────────────────────────────────

@admin_router.get("/appeals")
async def list_appeals(db: DatabaseDep, admin: AdminDep, status: str = "", page: int = Query(1, ge=1)):
    query = select(ContentAppeal)
    if status:
        query = query.where(ContentAppeal.status == status)
    rows = (await db.scalars(query.order_by(ContentAppeal.created_at.desc()).offset((page - 1) * 50).limit(50))).all()
    result = []
    for a in rows:
        report = await db.get(Report, a.report_id)
        book = await db.get(Audiobook, report.audiobook_id)
        result.append({"id": str(a.id), "report_id": str(a.report_id), "status": a.status, "reason": a.reason,
                       "explanation": a.explanation, "created_at": iso(a.created_at), "violation": report.violation,
                       "audiobook": {"id": str(book.id), "title": book.title} if book else None,
                       "owner": await person(db, a.user_id)})
    return result


class AppealDecision(BaseModel):
    action: Literal["accept", "reject"]
    note: str = Field(default="", max_length=2000)
    delete_content: bool = False
    confirm: str = ""

    @model_validator(mode="after")
    def checks(self):
        if self.action == "reject" and len(self.note.strip()) < 3:
            raise ValueError("Explain why the appeal is rejected")
        if self.delete_content and self.confirm != "DELETE":
            raise ValueError("Type DELETE to confirm permanent deletion")
        return self


@admin_router.post("/appeals/{appeal_id}/decision")
async def decide_appeal(appeal_id: UUID, data: AppealDecision, db: DatabaseDep, admin: AdminDep):
    row = await db.scalar(select(ContentAppeal).where(ContentAppeal.id == appeal_id).with_for_update())
    if not row:
        raise HTTPException(404, "Appeal not found")
    if row.status != "pending":
        raise HTTPException(409, "This appeal has already been decided")
    report = await open_report(db, row.report_id)
    book = await db.get(Audiobook, report.audiobook_id)
    row.status = "accepted" if data.action == "accept" else "rejected"
    row.decision_note, row.decided_by, row.decided_at = data.note.strip(), admin.id, mod.now()
    audit(db, admin, f"moderation.appeal.{row.status}", report.id, appeal_id=str(row.id), note=data.note)
    if data.action == "accept":
        await mod.reverse_case(db, admin, report)
        report.resolution = data.note or "Appeal accepted"
        mod.set_status(db, admin, report, "resolved", data.note, outcome="appeal_accepted")
        body = (f"«{book.title if book else ''}» নিয়ে আপনার আপিল গৃহীত হয়েছে। "
                "এই সিদ্ধান্তের কারণে নেওয়া সব ব্যবস্থা তুলে নেওয়া হয়েছে।")
        if data.note:
            body += f"\n\nমডারেটরের বার্তা: {data.note}"
        notice = notify(db, row.user_id, "moderation.appeal_accepted", "আপিল গৃহীত হয়েছে", body,
                        report_id=str(report.id), audiobook_id=str(report.audiobook_id))
    else:
        notice = await mod.confirm_violation(db, admin, report, delete_content=data.delete_content, note=data.note.strip())
        notice.title = "আপিল প্রত্যাখ্যাত হয়েছে"
        notice.body = f"{notice.body}\n\nকারণ: {data.note.strip()}"
    await db.commit()
    await deliver(db, [notice])
    return {"id": str(row.id), "status": row.status, "report_status": report.status}


# ── Admin: evidence and account records ─────────────────────────────────────

@admin_router.get("/moderation/evidence/{evidence_id}")
async def evidence_file(evidence_id: UUID, db: DatabaseDep, admin: AdminDep):
    row = await db.get(ModerationEvidence, evidence_id)
    path = await get_storage_service().get_file_path(row.storage_key) if row else None
    if not path:
        raise HTTPException(404, "Evidence not found")
    audit(db, admin, "moderation.evidence.viewed", row.id)
    await db.commit()
    return FileResponse(path, media_type=row.content_type, filename=row.filename, headers={"Cache-Control": "no-store"})


@admin_router.get("/users/{user_id}/moderation")
async def user_record(user_id: UUID, db: DatabaseDep, admin: AdminDep):
    if not await db.get(User, user_id):
        raise HTTPException(404, "User not found")
    return await account_record(db, user_id)


@admin_router.post("/restrictions/{restriction_id}/lift")
async def lift_restriction(restriction_id: UUID, data: NoteInput, db: DatabaseDep, admin: AdminDep):
    row = await db.get(UserRestriction, restriction_id)
    if not row or row.lifted_at:
        raise HTTPException(404, "Active restriction not found")
    row.lifted_at = mod.now()
    user = await db.get(User, row.user_id)
    await db.flush()
    await mod.refresh_restriction(db, user)
    audit(db, admin, "moderation.user.restriction_lifted", user.id, restriction_id=str(row.id), note=data.note)
    await db.commit()
    return await account_record(db, user.id)


@admin_router.post("/flags/{action_id}/remove")
async def remove_flag(action_id: UUID, data: NoteInput, db: DatabaseDep, admin: AdminDep):
    row = await db.get(ModerationAction, action_id)
    if not row or row.kind != "flag" or row.reversed_at:
        raise HTTPException(404, "Active flag not found")
    row.reversed_at = mod.now()
    audit(db, admin, "moderation.user.flag_removed", row.target_user_id, flag_id=str(row.id), note=data.note)
    await db.commit()
    return await account_record(db, row.target_user_id)
