"""
Account deletion: removes the user and everything that belongs to them.

Every table with a foreign key to a deleted row is found from the model
metadata, so new tables are covered automatically. Rows that depend on the
user (their audiobooks, chapters, channel, playlists, follows, payments,
reports, notifications, ...) are deleted recursively, deepest first. The
admin audit trail is kept but no longer points to the person (actor set to
NULL). Stored files (audio, covers, PDFs, documents) are removed afterwards.
"""
import logging
from typing import Any

from sqlalchemy import Table, delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Audiobook, AudiobookVisibility, Chapter, User
from app.models.base import Base
from app.models.moderation import ModerationEvidence
from app.models.platform import PublisherApplication
from app.services.storage_service import get_storage_service

logger = logging.getLogger(__name__)

# Columns set to NULL instead of deleting the row (records others rely on).
KEEP_AS_NULL = {("audit_history", "actor_id")}
MAX_DEPTH = 10


async def _purge(db: AsyncSession, table: Table, where: Any, depth: int = 0) -> None:
    """Delete rows of `table` matching `where`, after everything that references them."""
    if depth > MAX_DEPTH:
        raise RuntimeError(f"Dependency chain too deep at {table.name}")
    for child in Base.metadata.sorted_tables:
        if child is table:
            continue
        for fk in child.foreign_keys:
            if fk.column.table is not table:
                continue
            referenced = select(fk.column).where(where)
            if (child.name, fk.parent.name) in KEEP_AS_NULL:
                await db.execute(update(child).where(fk.parent.in_(referenced)).values({fk.parent.name: None}))
            else:
                await _purge(db, child, fk.parent.in_(referenced), depth + 1)
    await db.execute(delete(table).where(where))


async def _file_keys(db: AsyncSession, user: User) -> list[str]:
    books = select(Audiobook.id).where(Audiobook.owner_id == user.id)
    keys: list[str] = []
    for cover, source in (await db.execute(
            select(Audiobook.cover_image_url, Audiobook.source_file_url).where(Audiobook.owner_id == user.id))).all():
        if cover and cover.startswith("/api/v1/covers/"):
            keys.append("/uploads/covers/" + cover.rsplit("/", 1)[-1])
        if source:
            keys.append(source)
    keys += [k for k in (await db.scalars(select(Chapter.audio_url).where(Chapter.audiobook_id.in_(books)))).all() if k]
    keys += (await db.scalars(select(PublisherApplication.document_key).where(
        PublisherApplication.user_id == user.id))).all()
    keys += (await db.scalars(select(ModerationEvidence.storage_key).where(
        ModerationEvidence.uploaded_by == user.id))).all()
    return [k for k in keys if k and k.startswith("/uploads/")]


async def delete_channel(db: AsyncSession, channel) -> int:
    """Remove a channel. Its audiobooks stay with the publisher as private drafts
    (hidden from listeners); follows and channel playlists go with it.
    Returns how many audiobooks were moved out."""
    moved = await db.execute(update(Audiobook).where(Audiobook.channel_id == channel.id).values(
        channel_id=None, visibility=AudiobookVisibility.PRIVATE))
    await db.execute(update(Audiobook).where(
        Audiobook.owner_id == channel.owner_id, Audiobook.publication_status == "published",
        Audiobook.channel_id.is_(None)).values(publication_status="draft"))
    channels = channel.__table__
    await _purge(db, channels, channels.c.id == channel.id)
    return moved.rowcount or 0


async def delete_account(db: AsyncSession, user: User) -> None:
    files = await _file_keys(db, user)
    users = User.__table__
    await _purge(db, users, users.c.id == user.id)
    await db.commit()
    storage = get_storage_service()
    for key in files:
        try:
            await storage.delete_file(key)
        except Exception:  # A missing file must not undo a completed deletion.
            logger.warning("Could not delete %s after account deletion", key)
