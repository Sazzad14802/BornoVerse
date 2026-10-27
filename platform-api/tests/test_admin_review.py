"""
Admin review rules: a reason is required only to reject (and reaches the user),
the attention counts behind the sidebar badges, success-only payment history
and catalog sorting.
"""

from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID

from sqlalchemy import select

from app.models.notification import Notification
from app.models.platform import Order
from tests.test_platform import account, admin, mock_payments, pdf, public_book


async def apply(client, headers):
    submitted = await client.post('/api/v1/publisher/applications', headers=headers,
                                  data={"legal_name": "Test Publisher"},
                                  files={"file": ("proof.pdf", pdf(), "application/pdf")})
    assert submitted.status_code == 200, submitted.text
    return submitted.json()['id']


async def test_reject_needs_a_reason_and_notifies_it(client, db_session, admin):
    user, headers = await account(client)
    application = await apply(client, headers)

    url = f'/api/v1/admin/applications/{application}/decision'
    assert (await client.post(url, headers=admin, json={"action": "reject"})).status_code == 422
    assert (await client.post(url, headers=admin, json={"action": "reject", "reason": "  "})).status_code == 422
    rejected = await client.post(url, headers=admin, json={"action": "reject", "reason": "Document is unreadable"})
    assert rejected.status_code == 200, rejected.text

    notice = await db_session.scalar(select(Notification).where(Notification.user_id == UUID(user['id'])))
    assert notice.kind == "publisher.rejected"
    assert "Document is unreadable" in notice.body


async def test_other_decisions_need_no_reason(client, db_session, admin):
    user, headers = await account(client)
    application = await apply(client, headers)
    approved = await client.post(f'/api/v1/admin/applications/{application}/decision',
                                 headers=admin, json={"action": "approve"})
    assert approved.status_code == 200, approved.text
    suspended = await client.post(f"/api/v1/admin/users/{user['id']}/decision",
                                  headers=admin, json={"action": "suspend"})
    assert suspended.status_code == 200, suspended.text


async def test_attention_counts_pending_work(client, admin):
    _, headers = await account(client)
    assert (await client.get('/api/v1/admin/attention', headers=admin)).json() == {
        "applications": 0, "reports": 0, "withdrawals": 0}
    await apply(client, headers)
    counts = (await client.get('/api/v1/admin/attention', headers=admin)).json()
    assert counts["applications"] == 1
    assert (await client.get('/api/v1/admin/attention', headers=headers)).status_code == 403


async def test_payment_history_lists_only_successful_payments(client, db_session):
    user, headers = await account(client)
    owner = UUID(user['id'])
    for key, status in [("paid", "success"), ("open", "pending"), ("bad", "failed"), ("gone", "cancelled")]:
        db_session.add(Order(user_id=owner, kind="subscription", months=1, amount=Decimal("150"),
                             status=status, idempotency_key=key))
    await db_session.commit()
    history = (await client.get('/api/v1/payments', headers=headers)).json()
    assert [order["status"] for order in history] == ["success"]


async def test_catalog_sorting(client, db_session, owner_tokens):
    first = await public_book(db_session, owner_tokens['user'])
    second = await public_book(db_session, owner_tokens['user'])
    first.title, first.duration_seconds = "Zebra tales", 300
    second.title, second.duration_seconds = "apple stories", 60
    first.created_at = datetime(2025, 1, 1, tzinfo=timezone.utc)
    second.created_at = datetime(2025, 6, 1, tzinfo=timezone.utc)
    await db_session.commit()

    async def titles(sort):
        response = await client.get(f'/api/v1/audiobooks?sort={sort}')
        assert response.status_code == 200, response.text
        return [b["title"] for b in response.json()["items"]]

    assert await titles("newest") == ["apple stories", "Zebra tales"]
    assert await titles("oldest") == ["Zebra tales", "apple stories"]
    assert await titles("title") == ["apple stories", "Zebra tales"]
    assert await titles("shortest") == ["apple stories", "Zebra tales"]
    assert await titles("longest") == ["Zebra tales", "apple stories"]
    assert (await client.get('/api/v1/audiobooks?sort=random')).status_code == 422
