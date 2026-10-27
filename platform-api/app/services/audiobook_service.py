"""
Audiobook service: handles creation, retrieval, updates, deletion,
and strict PUBLIC / PRIVATE visibility enforcement.
"""

import math
from typing import Optional
import uuid
from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audiobook import Audiobook, AudiobookStatus, AudiobookVisibility
from app.models.user import User
from app.schemas.audiobook import AudiobookCreate, AudiobookUpdate
from app.services.policy import public_conditions, publishing
from app.models.platform import Channel

async def validate_channel(db, user, channel_id):
    if channel_id:
        channel = await db.get(Channel, channel_id)
        if not channel or channel.owner_id != user.id:
            raise HTTPException(403, "Channel must belong to the publisher")
        if channel.moderated:
            raise HTTPException(409, "This channel is restricted by an administrator")


async def create_audiobook(
    db: AsyncSession,
    user: User,
    data: AudiobookCreate,
) -> Audiobook:
    """Create a new audiobook record owned by the current user."""
    if user.account_type == "admin":
        raise HTTPException(403, "Administrators cannot create audiobooks")
    # Anyone can create and generate privately; publishing goes through a verified channel.
    if data.visibility == AudiobookVisibility.PUBLIC or data.channel_id or data.access_tier == "premium":
        publishing(user)
    if data.visibility == AudiobookVisibility.PUBLIC and not data.channel_id:
        raise HTTPException(409, "Public audiobooks must be published in one of your channels")
    await validate_channel(db, user, data.channel_id)
    audiobook = Audiobook(
        owner_id=user.id,
        title=data.title.strip(),
        author=data.author.strip() if data.author else None,
        description=data.description.strip() if data.description else None,
        language=data.language.strip().lower(),
        visibility=data.visibility,
        status=AudiobookStatus.PENDING,
        genre=data.genre, channel_id=data.channel_id, access_tier=data.access_tier,
        publication_status="published" if data.visibility == AudiobookVisibility.PUBLIC else "draft",
    )
    db.add(audiobook)
    await db.commit()
    await db.refresh(audiobook)
    return audiobook


async def get_audiobook_for_user(
    db: AsyncSession,
    audiobook_id: uuid.UUID,
    user: Optional[User] = None,
) -> Audiobook:
    """
    Retrieve an audiobook applying strict authorization and visibility rules:
    - Owner: Full access regardless of visibility or generation status.
    - Other users / Anonymous: Access ONLY if visibility == PUBLIC and status == COMPLETED.
    - If unauthorized or not found: Raises 404 to avoid leaking private resource existence.
    """
    result = await db.execute(
        select(Audiobook).where(Audiobook.id == audiobook_id)
    )
    audiobook = result.scalar_one_or_none()

    if not audiobook or (audiobook.publication_status == "deleted" and not (user and user.account_type == "admin")):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Audiobook not found",
        )

    # If requester is the owner, allow access
    if user and (audiobook.owner_id == user.id or user.account_type == "admin"):
        return audiobook

    # For non-owners: must be strictly PUBLIC and COMPLETED
    if (
        await db.scalar(select(Audiobook.id).where(Audiobook.id == audiobook.id, public_conditions()))
    ):
        return audiobook

    # Otherwise return 404 to prevent information leakage
    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="Audiobook not found",
    )


async def get_audiobook_raw(
    db: AsyncSession,
    audiobook_id: uuid.UUID,
) -> Optional[Audiobook]:
    """Internal helper to retrieve audiobook without authorization filtering."""
    result = await db.execute(
        select(Audiobook).where(Audiobook.id == audiobook_id, Audiobook.publication_status != "deleted")
    )
    return result.scalar_one_or_none()


# Catalog sort options; Audiobook.id breaks ties so pages never overlap.
CATALOG_ORDER = {
    "newest": (Audiobook.created_at.desc(),),
    "oldest": (Audiobook.created_at.asc(),),
    "title": (func.lower(Audiobook.title).asc(),),
    "shortest": (Audiobook.duration_seconds.asc(),),
    "longest": (Audiobook.duration_seconds.desc(),),
}


async def get_public_audiobooks(
    db: AsyncSession,
    page: int = 1,
    size: int = 20,
    language: Optional[str] = None,
    author: Optional[str] = None,
    status_filter: Optional[AudiobookStatus] = None,
    q: Optional[str] = None,
    genre: Optional[str] = None,
    publisher: Optional[uuid.UUID] = None,
    channel: Optional[uuid.UUID] = None,
    access_tier: Optional[str] = None,
    sort: str = "newest",
) -> tuple[list[Audiobook], int, int]:
    """
    Public audiobook discovery endpoint.
    Guarantees that PRIVATE audiobooks are NEVER exposed.
    Only audiobooks with visibility == PUBLIC and status == COMPLETED are returned.
    """
    page = max(1, page)
    size = min(max(1, size), 100)

    # Base query: strictly PUBLIC and COMPLETED
    conditions = [public_conditions()]
    if q and q.strip():
        term = f"%{q.strip()}%"
        conditions.append(or_(Audiobook.title.ilike(term), Audiobook.author.ilike(term)))
    if genre:
        conditions.append(Audiobook.genre == genre)
    if publisher:
        conditions.append(Audiobook.owner_id == publisher)
    if channel:
        conditions.append(Audiobook.channel_id == channel)
    if access_tier:
        conditions.append(Audiobook.access_tier == access_tier)

    if language:
        conditions.append(Audiobook.language == language.strip().lower())
    if author:
        conditions.append(Audiobook.author.ilike(f"%{author.strip()}%"))
    if status_filter and status_filter == AudiobookStatus.COMPLETED:
        # Note: public discovery only allows COMPLETED books anyway
        conditions.append(Audiobook.status == status_filter)

    # Count total
    count_query = select(func.count()).select_from(Audiobook).where(*conditions)
    total_result = await db.execute(count_query)
    total = total_result.scalar_one()

    # Fetch paginated items
    query = (
        select(Audiobook)
        .where(*conditions)
        .order_by(*CATALOG_ORDER.get(sort, CATALOG_ORDER["newest"]), Audiobook.id)
        .offset((page - 1) * size)
        .limit(size)
    )
    result = await db.execute(query)
    items = list(result.scalars().all())

    pages = math.ceil(total / size) if total > 0 else 1
    return items, total, pages


async def get_user_audiobooks(
    db: AsyncSession,
    user: User,
    page: int = 1,
    size: int = 20,
) -> tuple[list[Audiobook], int, int]:
    """Retrieve all audiobooks created and owned by the authenticated user."""
    page = max(1, page)
    size = min(max(1, size), 100)

    conditions = [Audiobook.owner_id == user.id, Audiobook.publication_status != "deleted"]

    count_query = select(func.count()).select_from(Audiobook).where(*conditions)
    total_result = await db.execute(count_query)
    total = total_result.scalar_one()

    query = (
        select(Audiobook)
        .where(*conditions)
        .order_by(Audiobook.created_at.desc())
        .offset((page - 1) * size)
        .limit(size)
    )
    result = await db.execute(query)
    items = list(result.scalars().all())

    pages = math.ceil(total / size) if total > 0 else 1
    return items, total, pages


async def update_audiobook(
    db: AsyncSession,
    audiobook_id: uuid.UUID,
    user: User,
    data: AudiobookUpdate,
) -> Audiobook:
    """Update audiobook metadata. Only the owner can perform this action."""
    audiobook = await get_audiobook_raw(db, audiobook_id)
    if not audiobook:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Audiobook not found",
        )

    if audiobook.owner_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the audiobook owner can update metadata",
        )

    if data.title is not None:
        audiobook.title = data.title.strip()
    if data.author is not None:
        audiobook.author = data.author.strip()
    if data.description is not None:
        audiobook.description = data.description.strip()
    if data.language is not None:
        audiobook.language = data.language.strip().lower()
    if data.cover_image_url is not None:
        audiobook.cover_image_url = data.cover_image_url.strip()
    if data.channel_id or data.access_tier == "premium":
        publishing(user)
    await validate_channel(db, user, data.channel_id)
    for key in ("genre", "channel_id", "access_tier"):
        if key in data.model_fields_set:
            setattr(audiobook, key, getattr(data, key))
    if audiobook.channel_id is None and audiobook.visibility == AudiobookVisibility.PUBLIC:
        # Leaving its channel takes the audiobook out of public listings.
        audiobook.visibility = AudiobookVisibility.PRIVATE
        audiobook.publication_status = "draft"

    await db.commit()
    await db.refresh(audiobook)
    return audiobook


async def update_visibility(
    db: AsyncSession,
    audiobook_id: uuid.UUID,
    user: User,
    new_visibility: AudiobookVisibility,
) -> Audiobook:
    """
    Update audiobook visibility (PUBLIC <-> PRIVATE).
    Only the owner can perform this action.
    """
    audiobook = await get_audiobook_raw(db, audiobook_id)
    if not audiobook:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Audiobook not found",
        )

    if audiobook.owner_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the audiobook owner can change its visibility",
        )

    if new_visibility == AudiobookVisibility.PUBLIC:
        publishing(user)
        if not audiobook.channel_id:
            raise HTTPException(409, "Add the audiobook to one of your channels to publish it")
        if audiobook.moderated or audiobook.status != AudiobookStatus.COMPLETED:
            raise HTTPException(409, "Only completed, unrestricted audiobooks can be published")
    audiobook.visibility = new_visibility
    audiobook.publication_status = "published" if new_visibility == AudiobookVisibility.PUBLIC else "draft"
    await db.commit()
    await db.refresh(audiobook)
    return audiobook


async def delete_audiobook(
    db: AsyncSession,
    audiobook_id: uuid.UUID,
    user: User,
) -> bool:
    """Delete an audiobook. Only the owner can perform this action."""
    audiobook = await get_audiobook_raw(db, audiobook_id)
    if not audiobook:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Audiobook not found",
        )

    if audiobook.owner_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the audiobook owner can delete it",
        )

    # Preserve accounting, report and playback references; hide the content immediately.
    from app.models import GenerationJob
    from sqlalchemy import update
    audiobook.visibility = AudiobookVisibility.PRIVATE
    audiobook.publication_status = "deleted"
    await db.execute(update(GenerationJob).where(GenerationJob.audiobook_id == audiobook_id,
        GenerationJob.status.in_([AudiobookStatus.PENDING, AudiobookStatus.PROCESSING])).values(
        cancelled=True, lease_token=None, status=AudiobookStatus.FAILED))
    await db.commit()
    return True
