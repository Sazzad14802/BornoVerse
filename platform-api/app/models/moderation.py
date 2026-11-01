"""
Content moderation: admin actions on a report, appeals, private evidence,
strikes and publishing restrictions. Every row is kept even if the audiobook
is later deleted; the audit trail lives in `audit_history`.
"""
from datetime import datetime, timezone
from typing import Optional
import uuid

from sqlalchemy import JSON, DateTime, ForeignKey, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, UUIDPrimaryKeyMixin


def _now() -> datetime:
    return datetime.now(timezone.utc)


class ModerationAction(Base, UUIDPrimaryKeyMixin):
    """One admin action taken on a report: notify, hide, restrict, flag, delete, strike."""
    __tablename__ = "moderation_actions"
    report_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("content_reports.id"), index=True)
    admin_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id"))
    target_user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id"), index=True)
    audiobook_id: Mapped[Optional[uuid.UUID]] = mapped_column(Uuid, ForeignKey("audiobooks.id"))
    kind: Mapped[str] = mapped_column(String(20))
    details: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    # Set when the action was undone (accepted appeal, admin lifted it).
    reversed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))


class ContentAppeal(Base, UUIDPrimaryKeyMixin):
    """The content owner's appeal against the actions on one report."""
    __tablename__ = "content_appeals"
    report_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("content_reports.id"), unique=True)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id"), index=True)
    reason: Mapped[str] = mapped_column(String(40))
    explanation: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(20), default="pending")  # pending | accepted | rejected
    decision_note: Mapped[str] = mapped_column(Text, default="")
    decided_by: Mapped[Optional[uuid.UUID]] = mapped_column(Uuid, ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    decided_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))


class ModerationEvidence(Base, UUIDPrimaryKeyMixin):
    """A private file attached to a report or an appeal; only admins can open it."""
    __tablename__ = "moderation_evidence"
    report_id: Mapped[Optional[uuid.UUID]] = mapped_column(Uuid, ForeignKey("content_reports.id"), index=True)
    appeal_id: Mapped[Optional[uuid.UUID]] = mapped_column(Uuid, ForeignKey("content_appeals.id"), index=True)
    uploaded_by: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id"))
    storage_key: Mapped[str] = mapped_column(String(1024))
    filename: Mapped[str] = mapped_column(String(255))
    content_type: Mapped[str] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class UserStrike(Base, UUIDPrimaryKeyMixin):
    """A confirmed violation. Pending reports never create strikes."""
    __tablename__ = "user_strikes"
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id"), index=True)
    report_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("content_reports.id"))
    violation: Mapped[str] = mapped_column(String(30))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    revoked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))


class UserRestriction(Base, UUIDPrimaryKeyMixin):
    """A publishing restriction; ends on its own at `ends_at` (none = permanent)."""
    __tablename__ = "user_restrictions"
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id"), index=True)
    report_id: Mapped[Optional[uuid.UUID]] = mapped_column(Uuid, ForeignKey("content_reports.id"))
    kind: Mapped[str] = mapped_column(String(20), default="publishing")
    reason: Mapped[str] = mapped_column(Text, default="")
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    ends_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    lifted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
