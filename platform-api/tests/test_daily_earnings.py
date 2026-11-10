"""Daily publisher earnings, admin list filters, session renewal and case emails."""
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from uuid import UUID

from sqlalchemy import func, select

from app.models.platform import DailyEarning, DailyListen, Ledger, Order, Setting
from app.services import billing
from tests.test_moderation import reported
from tests.test_platform import account, admin, public_book  # noqa: F401  (fixtures)


async def test_finished_days_credit_publishers_by_that_days_listens(client, db_session, owner_tokens, admin):
    listener, _ = await account(client)
    book = await public_book(db_session, owner_tokens['user'])
    yesterday = (datetime.now(timezone.utc) - timedelta(days=1)).astimezone(
        __import__("zoneinfo").ZoneInfo("Asia/Dhaka")).strftime("%Y-%m-%d")
    db_session.add(Setting(key="earnings", value={"daily_from": yesterday}))
    # 300 BDT for one month, paid two days ago: about 10 BDT of it belongs to each day.
    paid = datetime.now(timezone.utc) - timedelta(days=2)
    db_session.add(Order(user_id=UUID(listener['id']), kind='subscription', months=1, amount=Decimal('300'),
                         status='success', idempotency_key='daily', updated_at=paid))
    db_session.add(DailyListen(user_id=UUID(listener['id']), audiobook_id=book.id,
                               publisher_id=UUID(owner_tokens['user']['id']), day=yesterday))
    await db_session.commit()

    assert await billing.close_due_days(db_session) == [yesterday]
    assert await billing.close_due_days(db_session) == []  # idempotent
    day = await db_session.get(DailyEarning, yesterday)
    assert Decimal('9') < day.revenue < Decimal('11') and day.listens == 1
    assert day.allocated == day.publisher_pool == (day.revenue * Decimal('0.7')).quantize(Decimal('0.01'))
    earned = await db_session.scalar(select(func.sum(Ledger.amount)).where(
        Ledger.publisher_id == UUID(owner_tokens['user']['id'])))
    assert earned == day.publisher_pool
    # The balance is withdrawable straight away.
    assert await billing.balance(db_session, UUID(owner_tokens['user']['id'])) == earned


async def test_admin_filters_serials_and_session_renewal(client, db_session, owner_tokens, admin):
    listener, headers = await account(client)
    users = (await client.get('/api/v1/admin/users?suspended=false&date_from=2020-01-01', headers=admin)).json()
    assert any(u['email'] == listener['email'] for u in users) and 'published_books' in users[0]
    assert (await client.get('/api/v1/admin/users?date_from=10-11-2026', headers=admin)).status_code == 422
    assert (await client.get('/api/v1/admin/audiobooks?access_tier=premium&moderated=false', headers=admin)).status_code == 200
    assert (await client.get('/api/v1/admin/channels?q=Stories', headers=admin)).status_code == 200
    assert (await client.get('/api/v1/admin/payments?status=success&date_to=2030-01-01', headers=admin)).status_code == 200
    audit = await client.get('/api/v1/admin/audit?group=payment&actor=system', headers=admin)
    assert audit.status_code == 200, audit.text

    renewed = await client.post('/api/v1/auth/session/renew', headers=headers)
    assert renewed.status_code == 200 and renewed.json()['access_token']
    await client.post('/api/v1/auth/logout', headers=headers)
    assert (await client.post('/api/v1/auth/session/renew', headers=headers)).status_code == 401


async def test_case_email_and_reporter_update(client, db_session, owner_tokens, admin):
    from app.models.notification import Notification
    _, _, report_id = await reported(client, db_session, owner_tokens)
    sent = await client.post(f'/api/v1/admin/reports/{report_id}/email', headers=admin,
                             json={"to": "both", "subject": "About your case", "message": "We are looking into it."})
    assert sent.status_code == 200, sent.text
    assert sent.json()['recipients'] == ['owner', 'reporter']
    dismissed = await client.post(f'/api/v1/admin/reports/{report_id}/dismiss', headers=admin, json={"note": ""})
    assert dismissed.status_code == 200
    kinds = set((await db_session.scalars(select(Notification.kind))).all())
    assert {'moderation.message', 'report.dismissed'} <= kinds
