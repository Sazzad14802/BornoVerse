from datetime import datetime, timezone
from zoneinfo import ZoneInfo
from fastapi import HTTPException
from sqlalchemy import select, and_
from app.models import User, Audiobook, AudiobookStatus, AudiobookVisibility
from app.models.platform import Channel, Setting, Audit

DEFAULTS = {"free_quota": 5, "premium_quota": 25, "publisher_quota": 100,
            "aging_seconds": 300, "max_attempts": 3, "lease_seconds": 900,
            "publisher_fee": "500.00", "publisher_percent": 70,
            "valid_play_seconds": 60, "revenue_base": "gross_confirmed_subscription_receipts"}

def utc(value):
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value

def month_now():
    return datetime.now(ZoneInfo("Asia/Dhaka")).strftime("%Y-%m")

def premium(user):
    return bool(user and not user.suspended and user.account_type == "user" and
                user.premium_until and utc(user.premium_until) > datetime.now(timezone.utc))

async def configuration(db):
    row = await db.get(Setting, "policy")
    return DEFAULTS | (row.value if row else {})

def audit(db, actor, action, target, **details):
    db.add(Audit(actor_id=actor.id if actor else None, action=action, target=str(target), details=details))

def is_publisher(user):
    return bool(user and user.account_type == "user" and user.publisher_status == "active" and not user.suspended)

def publishing(user):
    if not is_publisher(user):
        raise HTTPException(403, "Publisher verification is required")
    until = user.publishing_restricted_until
    if until and utc(until) > datetime.now(timezone.utc):
        raise HTTPException(403, f"Publishing is restricted until {utc(until):%Y-%m-%d %H:%M} UTC")

def public_conditions():
    return and_(Audiobook.visibility == AudiobookVisibility.PUBLIC,
                Audiobook.status == AudiobookStatus.COMPLETED,
                Audiobook.publication_status == "published", Audiobook.moderated.is_(False),
                Audiobook.owner_id.in_(select(User.id).where(User.suspended.is_(False),
                    User.account_type == "user", User.publisher_status == "active")),
                # Public content is only ever published through a channel.
                Audiobook.channel_id.in_(select(Channel.id).where(Channel.moderated.is_(False))))

async def authorize_audio(db, book, user):
    if user and user.account_type == "admin":
        return
    if user and book.owner_id == user.id:
        return
    visible = await db.scalar(select(Audiobook.id).where(Audiobook.id == book.id, public_conditions()))
    if not visible:
        raise HTTPException(404, "Audiobook not found")
    if book.access_tier == "premium" and not premium(user):
        raise HTTPException(403, "An active subscription is required")
