"""
Audiobook database model and status/visibility enums.
"""

import enum
from typing import TYPE_CHECKING, Optional
import uuid
from datetime import datetime
from sqlalchemy import Enum, Float, ForeignKey, String, Text, Uuid, Boolean, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.user import User
    from app.models.chapter import Chapter
    from app.models.generation_job import GenerationJob
    from app.models.library import LibraryItem
    from app.models.playback import PlaybackProgress


class AudiobookVisibility(str, enum.Enum):
    PUBLIC = "PUBLIC"
    PRIVATE = "PRIVATE"


class AudiobookStatus(str, enum.Enum):
    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


class Audiobook(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "audiobooks"
    genre: Mapped[Optional[str]] = mapped_column(String(100))
    channel_id: Mapped[Optional[uuid.UUID]] = mapped_column(Uuid, ForeignKey("channels.id"))
    access_tier: Mapped[str] = mapped_column(String(20), default="free", nullable=False)
    publication_status: Mapped[str] = mapped_column(String(20), default="draft", nullable=False)
    moderated: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # When channel followers were told about this audiobook (at most once).
    announced_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    owner_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    title: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        index=True,
    )
    author: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True,
        index=True,
    )
    description: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
    )
    cover_image_url: Mapped[Optional[str]] = mapped_column(
        String(1024),
        nullable=True,
    )
    source_file_url: Mapped[Optional[str]] = mapped_column(
        String(1024),
        nullable=True,
    )
    audio_url: Mapped[Optional[str]] = mapped_column(
        String(1024),
        nullable=True,
    )
    duration_seconds: Mapped[float] = mapped_column(
        Float,
        default=0.0,
        nullable=False,
    )
    language: Mapped[str] = mapped_column(
        String(10),
        default="en",
        index=True,
        nullable=False,
    )
    visibility: Mapped[AudiobookVisibility] = mapped_column(
        Enum(AudiobookVisibility, native_enum=False),
        default=AudiobookVisibility.PRIVATE,
        index=True,
        nullable=False,
    )
    status: Mapped[AudiobookStatus] = mapped_column(
        Enum(AudiobookStatus, native_enum=False),
        default=AudiobookStatus.PENDING,
        index=True,
        nullable=False,
    )

    # Relationships
    owner: Mapped["User"] = relationship(
        "User",
        back_populates="audiobooks",
    )
    chapters: Mapped[list["Chapter"]] = relationship(
        "Chapter",
        back_populates="audiobook",
        cascade="all, delete-orphan",
        order_by="Chapter.chapter_number",
    )
    generation_jobs: Mapped[list["GenerationJob"]] = relationship(
        "GenerationJob",
        back_populates="audiobook",
        cascade="all, delete-orphan",
        order_by="GenerationJob.created_at.desc()",
    )
    library_entries: Mapped[list["LibraryItem"]] = relationship(
        "LibraryItem",
        back_populates="audiobook",
        cascade="all, delete-orphan",
    )
    playback_records: Mapped[list["PlaybackProgress"]] = relationship(
        "PlaybackProgress",
        back_populates="audiobook",
        cascade="all, delete-orphan",
    )
    # Loaded with every query so listings can show the channel name.
    channel: Mapped[Optional["Channel"]] = relationship("Channel", lazy="selectin", viewonly=True)

    @property
    def channel_name(self) -> Optional[str]:
        """The channel's name, or None when there is none or it is not loaded (never lazy-loads)."""
        from sqlalchemy import inspect
        if "channel" in inspect(self).unloaded or self.channel is None:
            return None
        return self.channel.name
