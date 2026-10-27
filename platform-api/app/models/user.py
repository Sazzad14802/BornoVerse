"""
User database model.
"""

from typing import TYPE_CHECKING
from sqlalchemy import String, Boolean, Integer, DateTime, FetchedValue, UniqueConstraint
from datetime import datetime
from typing import Optional
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.audiobook import Audiobook
    from app.models.library import LibraryItem
    from app.models.playback import PlaybackProgress


class User(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "users"
    # Read server-generated values (serial) back with INSERT ... RETURNING.
    __mapper_args__ = {"eager_defaults": True}

    # Human-readable member number (U-0001) shown to administrators. PostgreSQL
    # fills it from the users_serial_seq sequence; the UUID stays the real key.
    serial: Mapped[Optional[int]] = mapped_column(Integer, server_default=FetchedValue(), unique=True)

    username: Mapped[str] = mapped_column(
        String(50),
        index=True,
        nullable=False,
    )
    email: Mapped[str] = mapped_column(
        String(255),
        index=True,
        nullable=False,
    )
    password_hash: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )
    # "user" for everyone on the platform, "admin" for operators. Publishing is a
    # verification status on a user, not a separate account.
    account_type: Mapped[str] = mapped_column(String(20), default="user", nullable=False)
    # none -> pending_approval -> approved_pending_payment -> active (or rejected)
    publisher_status: Mapped[str] = mapped_column(String(40), default="none", nullable=False)
    suspended: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    token_version: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    full_name: Mapped[Optional[str]] = mapped_column(String(150))
    premium_until: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    subscription_cancelled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    __table_args__ = (
        UniqueConstraint("email", name="uq_users_email"),
        UniqueConstraint("username", name="uq_users_username"),
    )

    # Relationships
    audiobooks: Mapped[list["Audiobook"]] = relationship(
        "Audiobook",
        back_populates="owner",
        cascade="all, delete-orphan",
    )
    library_items: Mapped[list["LibraryItem"]] = relationship(
        "LibraryItem",
        back_populates="user",
        cascade="all, delete-orphan",
    )
    playback_records: Mapped[list["PlaybackProgress"]] = relationship(
        "PlaybackProgress",
        back_populates="user",
        cascade="all, delete-orphan",
    )
