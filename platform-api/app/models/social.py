"""Listener preferences and channel follows (YouTube-style subscriptions)."""
from datetime import datetime, timezone
import uuid
from sqlalchemy import Boolean, DateTime, ForeignKey, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class UserInterest(Base):
    """A favourite picked during onboarding: a genre key or a channel id."""
    __tablename__ = "user_interests"
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    kind: Mapped[str] = mapped_column(String(10), primary_key=True)  # "genre" | "channel"
    value: Mapped[str] = mapped_column(String(64), primary_key=True)


class ChannelFollow(Base):
    """A listener following a channel; `notify` is the bell (new-upload notifications)."""
    __tablename__ = "channel_follows"
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    channel_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("channels.id", ondelete="CASCADE"), primary_key=True, index=True)
    notify: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
