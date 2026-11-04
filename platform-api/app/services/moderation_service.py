"""
Moderation workflow: a report is the case for one audiobook.

1. A listener reports content (pending). Other open reports on the same
   audiobook are handled together with it.
2. An admin reviews it (under_review) and takes independent actions: notify,
   hide content, restrict publishing, flag the account (action_taken). The
   owner gets a notice listing exactly those actions and 7 days to appeal.
3. The owner may appeal (appealed). Accepting it reverses every penalty of this
   case; rejecting it confirms the violation.
4. A confirmed violation records a strike and applies the escalation below;
   deleting the content is optional and soft (records are kept).
Pending reports never create strikes. Every step is written to the audit log
with the previous and new status.
"""
from datetime import datetime, timedelta, timezone
from typing import Optional
import uuid

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Audiobook, User
from app.models.moderation import ModerationAction, UserRestriction, UserStrike
from app.models.notification import Notification
from app.models.platform import Report
from app.services.notification_service import notify
from app.services.policy import audit

CATEGORIES = {
    "sexual_content": ("যৌন কনটেন্ট", "Sexual content"),
    "copyright": ("কপিরাইট লঙ্ঘন", "Copyright violation"),
    "plagiarism": ("চৌর্যবৃত্তি", "Plagiarism"),
    "fake_account": ("ভুয়া অ্যাকাউন্ট", "Fake account"),
    "illegal": ("বেআইনি কনটেন্ট", "Illegal content"),
    "harassment": ("হয়রানি", "Harassment"),
    "misleading": ("বিভ্রান্তিকর কনটেন্ট", "Misleading content"),
    "other": ("অন্যান্য", "Other"),
}
OPEN_STATUSES = ("pending", "under_review")
APPEAL_DAYS = 7
REPORTS_PER_DAY = 10
# Escalation by number of confirmed (unrevoked) strikes: restriction days, or "suspend".
STRIKE_POLICY = {1: None, 2: 7, 3: 30}
SUSPEND_AT = 4
PERMANENT = datetime(9999, 1, 1, tzinfo=timezone.utc)


def now() -> datetime:
    return datetime.now(timezone.utc)


def utc(value: Optional[datetime]) -> Optional[datetime]:
    if value is None:
        return None
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def category_label(key: Optional[str]) -> str:
    return CATEGORIES.get(key or "other", CATEGORIES["other"])[0]


def set_status(db, admin, report: Report, status: str, note: str = "", **details):
    previous, report.status = report.status, status
    audit(db, admin, f"moderation.report.{status}", report.id, previous_status=previous, new_status=status,
          note=note, audiobook_id=str(report.audiobook_id), **details)


async def siblings(db: AsyncSession, report: Report) -> list[Report]:
    """Other open reports on the same audiobook (handled together with this one)."""
    return list((await db.scalars(select(Report).where(
        Report.audiobook_id == report.audiobook_id, Report.id != report.id,
        Report.status.in_(OPEN_STATUSES)))).all())


async def refresh_restriction(db: AsyncSession, user: User) -> None:
    """Mirror the latest active publishing restriction on the user (expiry is automatic)."""
    rows = (await db.scalars(select(UserRestriction).where(
        UserRestriction.user_id == user.id, UserRestriction.kind == "publishing",
        UserRestriction.lifted_at.is_(None)))).all()
    active = [utc(r.ends_at) or PERMANENT for r in rows if (utc(r.ends_at) or PERMANENT) > now()]
    user.publishing_restricted_until = max(active) if active else None


async def restrict(db, admin, user: User, report: Report, days: Optional[int], reason: str) -> UserRestriction:
    row = UserRestriction(user_id=user.id, report_id=report.id, kind="publishing", reason=reason,
                          starts_at=now(), ends_at=now() + timedelta(days=days) if days else None)
    db.add(row)
    await db.flush()
    await refresh_restriction(db, user)
    audit(db, admin, "moderation.user.restricted", user.id, report_id=str(report.id),
          days=days, until=str(row.ends_at) if row.ends_at else "permanent", note=reason)
    return row


def action(db, admin, report: Report, kind: str, owner_id, **details) -> ModerationAction:
    row = ModerationAction(report_id=report.id, admin_id=admin.id, target_user_id=owner_id,
                           audiobook_id=report.audiobook_id, kind=kind, details=details)
    db.add(row)
    return row


def notice_body(title: str, violation: str, lines: list[tuple[str, str]], appeal: bool,
                english: bool = False) -> str:
    """The owner's notice. `lines` are (Bangla, English) pairs of the actions taken."""
    if english:
        body = [f"Your published content “{title}” was reported and reviewed by our moderation team.",
                f"Violation: {CATEGORIES.get(violation or 'other', CATEGORIES['other'])[1]}"]
        if lines:
            body.append("Actions taken:\n" + "\n".join(f"- {en}" for _, en in lines))
        if appeal:
            body.append(f"If you think this is a mistake, appeal within {APPEAL_DAYS} days (Publisher studio > Appeal).")
        return "\n\n".join(body)
    body = [f"আপনার প্রকাশিত কনটেন্ট «{title}» রিপোর্ট হয়েছে এবং আমাদের মডারেশন টিম পর্যালোচনা করেছে।",
            f"লঙ্ঘন: {category_label(violation)}"]
    if lines:
        body.append("নেওয়া ব্যবস্থা:\n" + "\n".join(f"- {bn}" for bn, _ in lines))
    if appeal:
        body.append(f"সিদ্ধান্তটি ভুল মনে হলে {APPEAL_DAYS} দিনের মধ্যে আপিল করুন (প্রকাশক স্টুডিও > আপিল করুন)।")
    return "\n\n".join(body)


async def take_actions(db: AsyncSession, admin: User, report: Report, *, violation: str, notify_owner: bool,
                       hide: bool, restrict_days: Optional[int], flag_note: str, message: str,
                       note: str) -> Optional[Notification]:
    if report.status not in (*OPEN_STATUSES, "action_taken"):
        raise HTTPException(409, "This case is already closed")
    if not (notify_owner or hide or restrict_days or flag_note):
        raise HTTPException(422, "Choose at least one action")
    book = await db.get(Audiobook, report.audiobook_id)
    owner = await db.get(User, report.owner_id or book.owner_id)
    report.owner_id, report.violation = owner.id, violation
    lines: list[tuple[str, str]] = []
    if hide and book and not book.moderated:
        book.moderated = True
        action(db, admin, report, "hide", owner.id)
        audit(db, admin, "moderation.content.hidden", book.id, report_id=str(report.id), note=note)
        lines.append(("কনটেন্টটি সাময়িকভাবে পাবলিক থেকে লুকানো হয়েছে।", "The content has been hidden from the public for now."))
    if restrict_days:
        await restrict(db, admin, owner, report, restrict_days, note or category_label(violation))
        action(db, admin, report, "restrict", owner.id, days=restrict_days)
        lines.append((f"আপনার প্রকাশের সুবিধা {restrict_days} দিনের জন্য সীমিত করা হয়েছে।",
                      f"Your publishing is restricted for {restrict_days} days."))
    if flag_note:
        # Internal: never mentioned to the owner.
        action(db, admin, report, "flag", owner.id, note=flag_note)
        audit(db, admin, "moderation.user.flagged", owner.id, report_id=str(report.id), note=flag_note)
    notice = None
    user_facing = notify_owner or bool(lines)
    if user_facing:
        report.appeal_deadline = now() + timedelta(days=APPEAL_DAYS)
        action(db, admin, report, "notify", owner.id, message=message)
        body = notice_body(book.title if book else "", violation, lines, appeal=True)
        body_en = notice_body(book.title if book else "", violation, lines, appeal=True, english=True)
        if message:
            body += f"\n\nমডারেটরের বার্তা: {message}"
            body_en += f"\n\nModerator's message: {message}"
        notice = notify(db, owner.id, "moderation.notice", "কনটেন্ট মডারেশন নোটিশ", body,
                        en=("Content moderation notice", body_en), report_id=str(report.id), audiobook_id=str(report.audiobook_id))
    set_status(db, admin, report, "action_taken", note, violation=violation, hidden=hide,
               restrict_days=restrict_days, flagged=bool(flag_note), notified=user_facing)
    for other in await siblings(db, report):
        other.resolution = f"Handled in case {report.id}"
        set_status(db, admin, other, "resolved", f"Merged into case {report.id}")
    return notice


async def open_admin_case(db: AsyncSession, admin: User, book: Audiobook, reason: str) -> Optional[Notification]:
    """A moderator hides content directly: open a case so the owner gets a notice and can appeal."""
    label = "Moderator action"
    report = Report(user_id=admin.id, audiobook_id=book.id, owner_id=book.owner_id, category="other",
                    details=reason, reason=f"{label}: {reason}" if reason else label, status="under_review",
                    source="admin")
    db.add(report)
    await db.flush()
    audit(db, admin, "moderation.report.opened_by_admin", report.id, new_status="under_review",
          audiobook_id=str(book.id))
    return await take_actions(db, admin, report, violation="other", notify_owner=True, hide=True,
                              restrict_days=None, flag_note="", message=reason, note=reason)


async def close_cases_for_restore(db: AsyncSession, admin: User, book: Audiobook, note: str) -> None:
    """A moderator restores content: reverse and close the cases that hid it."""
    reports = (await db.scalars(select(Report).where(
        Report.audiobook_id == book.id, Report.status.in_(("action_taken", "appealed"))))).all()
    for report in reports:
        await reverse_case(db, admin, report)
        report.resolution = note or "Content restored by a moderator"
        set_status(db, admin, report, "resolved", note, outcome="restored")


async def active_strikes(db: AsyncSession, user_id: uuid.UUID) -> int:
    return await db.scalar(select(func.count()).select_from(UserStrike).where(
        UserStrike.user_id == user_id, UserStrike.revoked_at.is_(None))) or 0


async def confirm_violation(db: AsyncSession, admin: User, report: Report, *, delete_content: bool,
                            note: str) -> Notification:
    """Record a strike, apply the escalation, optionally soft-delete; closes the case."""
    if report.status in ("resolved", "dismissed"):
        raise HTTPException(409, "This case is already closed")
    book = await db.get(Audiobook, report.audiobook_id)
    owner = await db.get(User, report.owner_id or book.owner_id)
    report.owner_id = owner.id
    violation = report.violation or report.category
    db.add(UserStrike(user_id=owner.id, report_id=report.id, violation=violation))
    await db.flush()
    strikes = await active_strikes(db, owner.id)
    action(db, admin, report, "strike", owner.id, total=strikes)
    audit(db, admin, "moderation.user.strike", owner.id, report_id=str(report.id), total_strikes=strikes, note=note)
    lines = [(f"আপনার অ্যাকাউন্টে একটি স্ট্রাইক যোগ হয়েছে (মোট {strikes})।",
              f"A strike was added to your account (total {strikes}).")]
    if strikes >= SUSPEND_AT:
        owner.suspended = True
        owner.token_version += 1
        action(db, admin, report, "suspend", owner.id)
        audit(db, admin, "moderation.user.suspended", owner.id, report_id=str(report.id), total_strikes=strikes)
        lines.append(("বারবার নীতিমালা লঙ্ঘনের কারণে আপনার অ্যাকাউন্ট স্থায়ীভাবে স্থগিত করা হয়েছে।",
                      "Your account has been suspended for repeated policy violations."))
    elif STRIKE_POLICY.get(strikes):
        days = STRIKE_POLICY[strikes]
        await restrict(db, admin, owner, report, days, f"Strike {strikes}")
        action(db, admin, report, "restrict", owner.id, days=days, automatic=True)
        lines.append((f"স্ট্রাইক নীতিমালা অনুযায়ী প্রকাশের সুবিধা {days} দিনের জন্য সীমিত।",
                      f"Under the strike policy, publishing is restricted for {days} days."))
    else:
        lines.append(("এটি একটি সতর্কবার্তা। পুনরায় লঙ্ঘন হলে প্রকাশের সুবিধা সীমিত হবে।",
                      "This is a warning. Another violation will restrict publishing."))
    if delete_content and book and book.publication_status != "deleted":
        book.publication_status, book.moderated = "deleted", True
        action(db, admin, report, "delete", owner.id)
        audit(db, admin, "moderation.content.deleted", book.id, report_id=str(report.id), note=note)
        lines.insert(0, ("কনটেন্টটি স্থায়ীভাবে সরানো হয়েছে।", "The content has been permanently removed."))
    report.resolution = note or "Violation confirmed"
    set_status(db, admin, report, "resolved", note, outcome="violation_confirmed", deleted=delete_content)
    for other in await siblings(db, report):
        other.resolution = f"Handled in case {report.id}"
        set_status(db, admin, other, "resolved", f"Merged into case {report.id}")
    title = book.title if book else ""
    return notify(db, owner.id, "moderation.violation_confirmed", "মডারেশন সিদ্ধান্ত চূড়ান্ত",
                  notice_body(title, violation, lines, appeal=False),
                  en=("Moderation decision is final", notice_body(title, violation, lines, appeal=False, english=True)),
                  report_id=str(report.id), audiobook_id=str(report.audiobook_id))


async def reverse_case(db: AsyncSession, admin: User, report: Report) -> None:
    """Undo every penalty of this case (accepted appeal)."""
    book = await db.get(Audiobook, report.audiobook_id)
    owner = await db.get(User, report.owner_id)
    for row in (await db.scalars(select(ModerationAction).where(
            ModerationAction.report_id == report.id, ModerationAction.reversed_at.is_(None)))).all():
        if row.kind in ("hide", "restrict", "flag", "strike"):
            row.reversed_at = now()
    if book and book.moderated and book.publication_status != "deleted":
        # Stay hidden only if another unresolved case still hides it.
        other_hide = await db.scalar(select(ModerationAction.id).where(
            ModerationAction.audiobook_id == book.id, ModerationAction.kind == "hide",
            ModerationAction.reversed_at.is_(None), ModerationAction.report_id != report.id))
        if not other_hide:
            book.moderated = False
            audit(db, admin, "moderation.content.restored", book.id, report_id=str(report.id))
    for row in (await db.scalars(select(UserRestriction).where(
            UserRestriction.report_id == report.id, UserRestriction.lifted_at.is_(None)))).all():
        row.lifted_at = now()
    for row in (await db.scalars(select(UserStrike).where(
            UserStrike.report_id == report.id, UserStrike.revoked_at.is_(None)))).all():
        row.revoked_at = now()
    await db.flush()
    if owner:
        await refresh_restriction(db, owner)
        audit(db, admin, "moderation.user.penalties_reversed", owner.id, report_id=str(report.id))
