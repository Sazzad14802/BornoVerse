"""
Audiobook Pydantic schemas.
"""

from datetime import datetime
from typing import Optional
import uuid
from pydantic import BaseModel, ConfigDict, Field

from app.models.audiobook import AudiobookStatus, AudiobookVisibility


class AudiobookCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    genre: str | None = Field(default=None, max_length=100)
    channel_id: uuid.UUID | None = None
    access_tier: str = Field(default="free", pattern="^(free|premium)$")
    title: str = Field(min_length=1, max_length=255, description="Audiobook title")
    author: Optional[str] = Field(default=None, max_length=255, description="Book author name")
    description: Optional[str] = Field(default=None, description="Audiobook description")
    language: str = Field(default="en", max_length=10, description="Language code (e.g. en, bn)")
    visibility: AudiobookVisibility = Field(
        default=AudiobookVisibility.PRIVATE,
        description="Audiobook visibility: PUBLIC or PRIVATE"
    )


class AudiobookUpdate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    genre: str | None = Field(default=None, max_length=100)
    channel_id: uuid.UUID | None = None
    access_tier: str | None = Field(default=None, pattern="^(free|premium)$")
    title: Optional[str] = Field(default=None, min_length=1, max_length=255)
    author: Optional[str] = Field(default=None, max_length=255)
    description: Optional[str] = None
    language: Optional[str] = Field(default=None, max_length=10)
    cover_image_url: Optional[str] = Field(default=None, max_length=1024)


class AudiobookVisibilityUpdate(BaseModel):
    visibility: AudiobookVisibility = Field(
        description="New visibility: 'PUBLIC' or 'PRIVATE'"
    )


class AudiobookRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    owner_id: uuid.UUID
    title: str
    author: Optional[str]
    description: Optional[str]
    cover_image_url: Optional[str]
    source_file_url: Optional[str]
    audio_url: Optional[str] = None
    duration_seconds: float = 0.0
    language: str
    visibility: AudiobookVisibility
    status: AudiobookStatus
    created_at: datetime
    updated_at: datetime
    genre: str | None = None
    channel_id: uuid.UUID | None = None
    channel_name: str | None = None
    access_tier: str = "free"
    publication_status: str = "draft"
    moderated: bool = False


class AudiobookListResponse(BaseModel):
    items: list[AudiobookRead]
    total: int
    page: int
    size: int
    pages: int
