"""
Follows, follower announcements and personal recommendations.

A channel's followers who turned the bell on are notified once, the first time
one of its audiobooks becomes publicly listed.
"""
from collections import Counter
from datetime import datetime, timezone
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Audiobook, PlaybackProgress
from app.models.notification import Notification
from app.models.platform import Channel
from app.models.social import ChannelFollow, UserInterest
from app.services.notification_service import notify
from app.services.policy import public_conditions

MIN_FAVOURITES = 5


async def is_public(db: AsyncSession, book_id: uuid.UUID) -> bool:
    return bool(await db.scalar(select(Audiobook.id).where(Audiobook.id == book_id, public_conditions())))


async def announce(db: AsyncSession, book: Audiobook) -> list[Notification]:
    """Stage new-upload notifications for bell followers; the caller commits and delivers."""
    if book.announced_at or not book.channel_id or not await is_public(db, book.id):
        return []
    book.announced_at = datetime.now(timezone.utc)
    channel = await db.get(Channel, book.channel_id)
    followers = (await db.scalars(select(ChannelFollow.user_id).where(
        ChannelFollow.channel_id == book.channel_id, ChannelFollow.notify.is_(True),
        ChannelFollow.user_id != book.owner_id))).all()
    return [notify(db, follower, "channel.new_audiobook", f"{channel.name}: নতুন অডিওবুক",
                   book.title, en=(f"{channel.name}: new audiobook", book.title),
                   image=book.cover_image_url or "", audiobook_id=str(book.id), channel_id=str(channel.id))
            for follower in followers]


async def interests(db: AsyncSession, user_id: uuid.UUID) -> tuple[list[str], list[str]]:
    rows = (await db.execute(select(UserInterest.kind, UserInterest.value)
                             .where(UserInterest.user_id == user_id))).all()
    return [v for k, v in rows if k == "genre"], [v for k, v in rows if k == "channel"]


async def recommendations(db: AsyncSession, user_id: uuid.UUID, limit: int = 20) -> tuple[list[Audiobook], str]:
    """
    Public audiobooks the listener has not started, ranked by how well their genre
    and channel match the listener's taste. Taste comes from listening history once
    there is any (weighted double) plus the onboarding favourites; followed channels
    get a boost. Remaining slots are filled with the newest releases.
    """
    history = (await db.execute(select(Audiobook.genre, Audiobook.channel_id).join(
        PlaybackProgress, PlaybackProgress.audiobook_id == Audiobook.id).where(
        PlaybackProgress.user_id == user_id))).all()
    favourite_genres, favourite_channels = await interests(db, user_id)
    followed = set((await db.scalars(select(ChannelFollow.channel_id)
                                     .where(ChannelFollow.user_id == user_id))).all())

    genre_weight, channel_weight = Counter(), Counter()
    for genre, channel in history:
        if genre:
            genre_weight[genre] += 2
        if channel:
            channel_weight[str(channel)] += 2
    for genre in favourite_genres:
        genre_weight[genre] += 1
    for channel in favourite_channels:
        channel_weight[channel] += 1
    for channel in followed:
        channel_weight[str(channel)] += 2
    basis = "history" if history else "favourites" if (favourite_genres or favourite_channels) else "new"

    started = select(PlaybackProgress.audiobook_id).where(PlaybackProgress.user_id == user_id)
    candidates = (await db.scalars(select(Audiobook).where(public_conditions(), Audiobook.id.not_in(started))
                                   .order_by(Audiobook.created_at.desc()).limit(300))).all()

    def score(book: Audiobook) -> float:
        return genre_weight.get(book.genre or "", 0) + 1.5 * channel_weight.get(str(book.channel_id), 0)

    ranked = sorted(candidates, key=score, reverse=True)  # stable: newest first among equals
    matched = [b for b in ranked if score(b) > 0][:limit]
    fill = [b for b in candidates if b not in matched][: limit - len(matched)]
    return matched + fill, basis
