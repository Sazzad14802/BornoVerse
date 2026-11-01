"""Persistent account workflows, billing, moderation, and accounting records."""
from datetime import datetime, timezone
from decimal import Decimal
import uuid
from typing import Optional
from sqlalchemy import String, Text, Integer, Boolean, DateTime, ForeignKey, Numeric, JSON, Uuid, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import Base, UUIDPrimaryKeyMixin, TimestampMixin

def now():
    return datetime.now(timezone.utc)

class Channel(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "channels"
    owner_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id"), index=True)
    name: Mapped[str] = mapped_column(String(150))
    description: Mapped[str] = mapped_column(Text, default="")
    moderated: Mapped[bool] = mapped_column(Boolean, default=False)

class PublisherApplication(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "publisher_applications"
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id"), index=True)
    legal_name: Mapped[str] = mapped_column(String(150))
    document_key: Mapped[str] = mapped_column(String(1024))
    status: Mapped[str] = mapped_column(String(30), default="pending")
    reason: Mapped[str] = mapped_column(Text, default="")

class Setting(Base):
    __tablename__ = "platform_settings"
    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    value: Mapped[dict] = mapped_column(JSON)

class Plan(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "subscription_plans"
    name: Mapped[str] = mapped_column(String(100))
    months: Mapped[int] = mapped_column(Integer)
    price: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    active: Mapped[bool] = mapped_column(Boolean, default=True)

class Order(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "payment_orders"
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id"), index=True)
    kind: Mapped[str] = mapped_column(String(30))
    plan_id: Mapped[Optional[uuid.UUID]] = mapped_column(Uuid, ForeignKey("subscription_plans.id"))
    months: Mapped[int] = mapped_column(Integer, default=0)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    status: Mapped[str] = mapped_column(String(20), default="pending")
    idempotency_key: Mapped[str] = mapped_column(String(100))
    provider: Mapped[str] = mapped_column(String(20), default="mock")
    gateway_session: Mapped[Optional[str]] = mapped_column(String(255))
    return_url: Mapped[Optional[str]] = mapped_column(String(1024))
    __table_args__ = (UniqueConstraint("user_id", "idempotency_key"),)

class PaymentEvent(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "payment_events"
    order_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("payment_orders.id"), index=True)
    status: Mapped[str] = mapped_column(String(20))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)

class Audit(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "audit_history"
    actor_id: Mapped[Optional[uuid.UUID]] = mapped_column(Uuid, ForeignKey("users.id"))
    action: Mapped[str] = mapped_column(String(100))
    target: Mapped[str] = mapped_column(String(100))
    details: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)

class Report(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """A listener's report on an audiobook; also the moderation case for it.

    status: pending -> under_review -> action_taken -> appealed -> resolved,
    or dismissed. One report per listener per audiobook.
    """
    __tablename__ = "content_reports"
    __table_args__ = (UniqueConstraint("user_id", "audiobook_id", name="uq_report_once_per_user"),)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id"))
    audiobook_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("audiobooks.id"))
    reason: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    resolution: Mapped[str] = mapped_column(Text, default="")
    category: Mapped[str] = mapped_column(String(30), default="other")
    details: Mapped[str] = mapped_column(Text, default="")
    # The content owner at report time (kept if the audiobook is deleted later).
    owner_id: Mapped[Optional[uuid.UUID]] = mapped_column(Uuid, ForeignKey("users.id"), index=True)
    violation: Mapped[Optional[str]] = mapped_column(String(30))
    appeal_deadline: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

class Quota(Base):
    __tablename__ = "generation_quotas"
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id"), primary_key=True)
    month: Mapped[str] = mapped_column(String(7), primary_key=True)
    used: Mapped[int] = mapped_column(Integer, default=0)

class PlaySession(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "play_sessions"
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id"), index=True)
    audiobook_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("audiobooks.id"))
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    last_heartbeat: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    seconds: Mapped[int] = mapped_column(Integer, default=0)
    last_position: Mapped[int] = mapped_column(Integer, default=0)
    eligible: Mapped[bool] = mapped_column(Boolean, default=False)

class EligibleView(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "eligible_views"
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id"))
    audiobook_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("audiobooks.id"))
    publisher_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id"), index=True)
    month: Mapped[str] = mapped_column(String(7), index=True)
    __table_args__ = (UniqueConstraint("user_id", "audiobook_id", "month"),)

class FinancialSnapshot(Base):
    __tablename__ = "financial_snapshots"
    month: Mapped[str] = mapped_column(String(7), primary_key=True)
    revenue: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    publisher_pool: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    platform_share: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    policy: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)

class Ledger(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "publisher_ledger"
    publisher_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id"), index=True)
    month: Mapped[str] = mapped_column(String(7))
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    kind: Mapped[str] = mapped_column(String(30))
    reference: Mapped[str] = mapped_column(String(100), unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)

class Withdrawal(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "withdrawals"
    publisher_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id"), index=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    status: Mapped[str] = mapped_column(String(20), default="pending")
    destination: Mapped[str] = mapped_column(String(150))
    reason: Mapped[str] = mapped_column(Text, default="")

class Playlist(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "playlists"
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id"))
    name: Mapped[str] = mapped_column(String(150))
    # Set for a publisher's channel playlist (public on the channel page);
    # empty for a listener's private playlist.
    channel_id: Mapped[Optional[uuid.UUID]] = mapped_column(Uuid, ForeignKey("channels.id", ondelete="CASCADE"), index=True)

class PlaylistBook(Base):
    __tablename__ = "playlist_books"
    playlist_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("playlists.id", ondelete="CASCADE"), primary_key=True)
    audiobook_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("audiobooks.id", ondelete="CASCADE"), primary_key=True)

class RecoveryToken(Base):
    __tablename__ = "recovery_tokens"
    digest: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id"))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used: Mapped[bool] = mapped_column(Boolean, default=False)
    # "code": the 6-digit code emailed to the user; "reset": the token that code is exchanged for.
    kind: Mapped[str] = mapped_column(String(10), default="reset")
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)

class FinancialAdjustment(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "financial_adjustments"
    order_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("payment_orders.id"))
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    kind: Mapped[str] = mapped_column(String(20))
    reason: Mapped[str] = mapped_column(Text)
    month: Mapped[str] = mapped_column(String(7))
    reference: Mapped[str] = mapped_column(String(100), unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
