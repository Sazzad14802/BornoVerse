"""
Notification service: persists in-app notifications and fans them out as push messages.

Design:
- `notify()` only stages a row in the caller's transaction, so a notification is
  never recorded for work that later rolls back.
- `deliver_pending()` is called *after* commit and pushes through a `PushSender`
  strategy (Expo Push API in normal runs, a no-op in tests or when disabled).
- Push is best-effort: delivery failures never fail the business operation; the
  in-app inbox remains the source of truth.
"""

from abc import ABC, abstractmethod
import logging
import uuid
from typing import Any, Iterable, Optional

import httpx
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.notification import Notification, PushToken

log = logging.getLogger(__name__)

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"


class PushSender(ABC):
    @abstractmethod
    async def send(self, messages: list[dict[str, Any]]) -> list[str]:
        """Send messages; return tokens the provider reported as unregistered."""


class NullPushSender(PushSender):
    async def send(self, messages: list[dict[str, Any]]) -> list[str]:
        return []


class ExpoPushSender(PushSender):
    async def send(self, messages: list[dict[str, Any]]) -> list[str]:
        stale: list[str] = []
        async with httpx.AsyncClient(timeout=10) as client:
            for start in range(0, len(messages), 100):  # Expo accepts 100 per request
                batch = messages[start:start + 100]
                try:
                    response = await client.post(EXPO_PUSH_URL, json=batch,
                                                 headers={"Accept": "application/json"})
                    response.raise_for_status()
                    tickets = response.json().get("data", [])
                except Exception as exc:  # network / provider outage: inbox still has the row
                    log.warning("Expo push delivery failed: %s", exc)
                    continue
                for message, ticket in zip(batch, tickets):
                    details = ticket.get("details") or {}
                    if ticket.get("status") == "error" and details.get("error") == "DeviceNotRegistered":
                        stale.append(message["to"])
        return stale


def get_push_sender() -> PushSender:
    return ExpoPushSender() if settings.PUSH_NOTIFICATIONS_ENABLED else NullPushSender()


def notify(
    db: AsyncSession,
    user_id: uuid.UUID,
    kind: str,
    title: str,
    body: str,
    **data: Any,
) -> Notification:
    """Stage a notification in the current transaction. Call `deliver()` after commit."""
    row = Notification(
        user_id=user_id,
        kind=kind,
        title=title,
        body=body,
        data={key: str(value) for key, value in data.items()},
    )
    db.add(row)
    return row


PUSH_BODY_CHARS = 160


def push_body(body: str) -> str:
    """Phones show a few lines: send the first paragraph; the full text stays in the inbox."""
    first = body.split("\n\n", 1)[0].strip()
    if len(first) > PUSH_BODY_CHARS:
        first = first[:PUSH_BODY_CHARS].rsplit(" ", 1)[0] + "…"
    return first + ("\nবিস্তারিত দেখতে ট্যাপ করুন।" if first != body.strip() else "")


async def deliver(db: AsyncSession, notifications: Iterable[Optional[Notification]]) -> None:
    """Push already-committed notifications to every device of their recipients."""
    rows = [n for n in notifications if n is not None]
    if not rows:
        return
    user_ids = {n.user_id for n in rows}
    tokens = (await db.execute(select(PushToken.user_id, PushToken.token)
                               .where(PushToken.user_id.in_(user_ids)))).all()
    by_user: dict[uuid.UUID, list[str]] = {}
    for user_id, token in tokens:
        by_user.setdefault(user_id, []).append(token)

    messages = [
        {
            "to": token,
            "title": n.title,
            "body": push_body(n.body),
            "sound": "default",
            "channelId": "default",
            "priority": "high",
            "data": {**n.data, "notification_id": str(n.id), "kind": n.kind},
        }
        for n in rows
        for token in by_user.get(n.user_id, [])
    ]
    if not messages:
        return
    stale = await get_push_sender().send(messages)
    if stale:
        await db.execute(delete(PushToken).where(PushToken.token.in_(stale)))
        await db.commit()


async def notify_and_deliver(db: AsyncSession, user_id: uuid.UUID, kind: str, title: str, body: str, **data: Any) -> None:
    """Convenience for code paths that own their transaction (workers, scripts)."""
    row = notify(db, user_id, kind, title, body, **data)
    await db.commit()
    await deliver(db, [row])
