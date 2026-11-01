"""Favourites, recommendations, channel pages, follows and the following feed."""
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select

from app.api.deps import DatabaseDep, MemberDep
from app.models import Audiobook, PlaybackProgress, User
from app.models.platform import Channel, Playlist, PlaylistBook
from app.models.social import ChannelFollow, UserInterest
from app.schemas.audiobook import AudiobookRead
from app.services.policy import public_conditions
from app.services.social_service import MIN_FAVOURITES, interests, recommendations

router = APIRouter()


def visible_channel():
    """Channels listeners can see: not restricted, owned by an active publisher."""
    return select(Channel).join(User, User.id == Channel.owner_id).where(
        Channel.moderated.is_(False), User.suspended.is_(False),
        User.account_type == "user", User.publisher_status == "active")


async def channel_or_404(db, channel_id: UUID) -> Channel:
    channel = await db.scalar(visible_channel().where(Channel.id == channel_id))
    if not channel:
        raise HTTPException(404, "Channel not found")
    return channel


# ── Favourites ───────────────────────────────────────────────────────────────

class FavouritesInput(BaseModel):
    genres: list[str] = Field(default_factory=list, max_length=30)
    channels: list[UUID] = Field(default_factory=list, max_length=50)


@router.get("/me/favourites")
async def get_favourites(db: DatabaseDep, user: MemberDep):
    genres, channels = await interests(db, user.id)
    has_history = bool(await db.scalar(select(PlaybackProgress.id).where(PlaybackProgress.user_id == user.id).limit(1)))
    # New listeners pick favourites first; people who already listen are never forced to.
    return {"genres": genres, "channels": channels, "required": not (genres or channels or has_history),
            "minimum": MIN_FAVOURITES}


@router.put("/me/favourites")
async def set_favourites(data: FavouritesInput, db: DatabaseDep, user: MemberDep):
    genres = sorted({g.strip().lower() for g in data.genres if g.strip()})
    channels = sorted(set(data.channels))
    if len(genres) + len(channels) < MIN_FAVOURITES:
        raise HTTPException(422, f"Choose at least {MIN_FAVOURITES} favourites")
    if channels:
        found = set((await db.scalars(visible_channel().with_only_columns(Channel.id).where(Channel.id.in_(channels)))).all())
        if found != set(channels):
            raise HTTPException(422, "Unknown channel in favourites")
    await db.execute(delete(UserInterest).where(UserInterest.user_id == user.id))
    db.add_all([UserInterest(user_id=user.id, kind="genre", value=g[:64]) for g in genres] +
               [UserInterest(user_id=user.id, kind="channel", value=str(c)) for c in channels])
    await db.commit()
    return {"genres": genres, "channels": [str(c) for c in channels]}


@router.get("/me/recommendations")
async def get_recommendations(db: DatabaseDep, user: MemberDep, limit: int = Query(20, ge=1, le=50)):
    books, basis = await recommendations(db, user.id, limit)
    return {"basis": basis, "items": [AudiobookRead.model_validate(b) for b in books]}


# ── Channels and follows ────────────────────────────────────────────────────

class FollowInput(BaseModel):
    notify: bool = False


async def channel_profile(db, channel: Channel, user) -> dict:
    follow = await db.get(ChannelFollow, (user.id, channel.id))
    owner = await db.get(User, channel.owner_id)
    return {
        "id": str(channel.id), "name": channel.name, "description": channel.description,
        "publisher_name": owner.full_name or owner.username,
        "followers": await db.scalar(select(func.count()).select_from(ChannelFollow).where(ChannelFollow.channel_id == channel.id)),
        "audiobooks": await db.scalar(select(func.count()).select_from(Audiobook).where(Audiobook.channel_id == channel.id, public_conditions())),
        "following": follow is not None, "notify": bool(follow and follow.notify),
        "is_owner": channel.owner_id == user.id,
    }


@router.get("/channels")
async def list_channels(db: DatabaseDep, user: MemberDep, q: str = ""):
    """Channels to browse (Explore, search, onboarding) with follower counts and the
    viewer's follow state; most-followed first."""
    counts = dict((await db.execute(select(ChannelFollow.channel_id, func.count()).group_by(ChannelFollow.channel_id))).all())
    follows = dict((await db.execute(select(ChannelFollow.channel_id, ChannelFollow.notify)
                                     .where(ChannelFollow.user_id == user.id))).all())
    query = visible_channel()
    if q.strip():
        query = query.where(Channel.name.ilike(f"%{q.strip()}%"))
    rows = (await db.scalars(query.order_by(Channel.name).limit(200))).all()
    rows = sorted(rows, key=lambda c: -counts.get(c.id, 0))
    return [{"id": str(c.id), "name": c.name, "description": c.description, "followers": counts.get(c.id, 0),
             "following": c.id in follows, "notify": bool(follows.get(c.id)), "is_owner": c.owner_id == user.id}
            for c in rows]


@router.get("/channels/{channel_id}")
async def get_channel(channel_id: UUID, db: DatabaseDep, user: MemberDep):
    channel = await channel_or_404(db, channel_id)
    profile = await channel_profile(db, channel, user)
    books = (await db.scalars(select(Audiobook).where(Audiobook.channel_id == channel.id, public_conditions())
                              .order_by(Audiobook.created_at.desc()).limit(100))).all()
    playlists = (await db.scalars(select(Playlist).where(Playlist.channel_id == channel.id).order_by(Playlist.created_at))).all()
    public_ids = {b.id for b in books}
    entries = (await db.execute(select(PlaylistBook.playlist_id, PlaylistBook.audiobook_id)
                                .where(PlaylistBook.playlist_id.in_([p.id for p in playlists])))).all() if playlists else []
    by_id = {b.id: b for b in books}
    profile["audiobook_items"] = [AudiobookRead.model_validate(b) for b in books]
    profile["playlists"] = [{
        "id": str(p.id), "name": p.name,
        "audiobooks": [AudiobookRead.model_validate(by_id[book]) for pl, book in entries if pl == p.id and book in public_ids],
    } for p in playlists]
    return profile


@router.put("/channels/{channel_id}/follow")
async def follow(channel_id: UUID, data: FollowInput, db: DatabaseDep, user: MemberDep):
    channel = await channel_or_404(db, channel_id)
    if channel.owner_id == user.id:
        raise HTTPException(409, "You cannot follow your own channel")
    row = await db.get(ChannelFollow, (user.id, channel.id))
    if row:
        row.notify = data.notify
    else:
        db.add(ChannelFollow(user_id=user.id, channel_id=channel.id, notify=data.notify))
    await db.commit()
    return await channel_profile(db, channel, user)


@router.delete("/channels/{channel_id}/follow")
async def unfollow(channel_id: UUID, db: DatabaseDep, user: MemberDep):
    channel = await channel_or_404(db, channel_id)
    await db.execute(delete(ChannelFollow).where(ChannelFollow.user_id == user.id, ChannelFollow.channel_id == channel.id))
    await db.commit()
    return await channel_profile(db, channel, user)


@router.get("/me/following")
async def following(db: DatabaseDep, user: MemberDep):
    rows = (await db.execute(visible_channel().add_columns(ChannelFollow.notify).join(
        ChannelFollow, ChannelFollow.channel_id == Channel.id).where(ChannelFollow.user_id == user.id)
        .order_by(ChannelFollow.created_at.desc()))).all()
    return [{"id": str(c.id), "name": c.name, "notify": notify} for c, notify in rows]


@router.get("/me/feed")
async def feed(db: DatabaseDep, user: MemberDep, page: int = Query(1, ge=1), size: int = Query(20, ge=1, le=50)):
    """Newest public audiobooks from the channels this listener follows."""
    followed = select(ChannelFollow.channel_id).where(ChannelFollow.user_id == user.id)
    books = (await db.scalars(select(Audiobook).where(public_conditions(), Audiobook.channel_id.in_(followed))
                              .order_by(Audiobook.created_at.desc()).offset((page - 1) * size).limit(size))).all()
    return [AudiobookRead.model_validate(b) for b in books]
