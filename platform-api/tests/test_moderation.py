"""
Moderation lifecycle: reports (no duplicates), evidence privacy, independent
admin actions with a notice that lists only what was done, appeals that reverse
penalties, confirmed violations with strikes and escalation, and the audit log.
"""

from datetime import datetime, timedelta, timezone
from io import BytesIO
from uuid import UUID

from pypdf import PdfWriter
from sqlalchemy import func, select

from app.models import Audiobook, AudiobookStatus, AudiobookVisibility, User
from app.models.moderation import UserRestriction, UserStrike
from app.models.notification import Notification
from app.models.platform import Audit
from tests.test_platform import account, admin, public_book


def pdf() -> bytes:
    writer = PdfWriter()
    writer.add_blank_page(width=100, height=100)
    buffer = BytesIO()
    writer.write(buffer)
    return buffer.getvalue()


async def reported(client, db_session, owner_tokens, email="reader@example.com", username="reader"):
    book = await public_book(db_session, owner_tokens['user'], 'free')
    _, headers = await account(client, email=email, username=username)
    created = await client.post('/api/v1/reports', headers=headers, json={
        "audiobook_id": str(book.id), "category": "copyright", "details": "This is a published novel."})
    assert created.status_code == 200, created.text
    return book, headers, created.json()["id"]


async def notices(db_session, user_id, kind):
    return (await db_session.scalars(select(Notification).where(
        Notification.user_id == UUID(user_id), Notification.kind == kind))).all()


async def test_report_rules_and_private_evidence(client, db_session, owner_tokens, admin):
    book, headers, report_id = await reported(client, db_session, owner_tokens)
    # Same listener, same audiobook: refused.
    again = await client.post('/api/v1/reports', headers=headers, json={"audiobook_id": str(book.id), "category": "plagiarism"})
    assert again.status_code == 409
    # Owners cannot report themselves; "Other" needs an explanation.
    assert (await client.post('/api/v1/reports', headers=owner_tokens['headers'],
                              json={"audiobook_id": str(book.id), "category": "copyright"})).status_code == 403
    _, other = await account(client, email="second@example.com", username="second")
    assert (await client.post('/api/v1/reports', headers=other, json={"audiobook_id": str(book.id),
                                                                      "category": "other"})).status_code == 422

    uploaded = await client.post(f'/api/v1/reports/{report_id}/evidence', headers=headers,
                                 files={"file": ("proof.pdf", pdf(), "application/pdf")})
    assert uploaded.status_code == 200, uploaded.text
    bad = await client.post(f'/api/v1/reports/{report_id}/evidence', headers=headers,
                            files={"file": ("note.txt", b"plain text", "text/plain")})
    assert bad.status_code == 400
    evidence_id = uploaded.json()["id"]
    assert (await client.get(f'/api/v1/admin/moderation/evidence/{evidence_id}', headers=headers)).status_code == 403
    assert (await client.get(f'/api/v1/admin/moderation/evidence/{evidence_id}', headers=admin)).status_code == 200

    rows = (await client.get('/api/v1/admin/reports?status=open', headers=admin)).json()
    assert rows[0]["category"] == "copyright" and rows[0]["evidence_count"] == 1
    assert rows[0]["audiobook"]["title"] == "Published story"
    assert rows[0]["owner"]["id"] == owner_tokens['user']['id']
    assert (await client.get('/api/v1/admin/attention', headers=admin)).json()["reports"] == 1


async def test_actions_are_independent_and_notice_matches(client, db_session, owner_tokens, admin):
    book, _, report_id = await reported(client, db_session, owner_tokens)
    _, second = await account(client, email="second@example.com", username="second")
    sibling = (await client.post('/api/v1/reports', headers=second, json={
        "audiobook_id": str(book.id), "category": "plagiarism"})).json()["id"]

    assert (await client.post(f'/api/v1/admin/reports/{report_id}/review', headers=admin, json={})).json()["status"] == "under_review"
    # Hide only: no restriction is mentioned and none exists.
    acted = await client.post(f'/api/v1/admin/reports/{report_id}/actions', headers=admin, json={
        "violation": "copyright", "notify": True, "hide": True, "flag_note": "Watch future uploads"})
    assert acted.status_code == 200, acted.text
    assert acted.json()["status"] == "action_taken"
    assert (await client.get('/api/v1/audiobooks')).json()["total"] == 0

    [notice] = await notices(db_session, owner_tokens['user']['id'], "moderation.notice")
    assert "লুকানো" in notice.body and "সীমিত" not in notice.body
    assert "Watch future uploads" not in notice.body  # flags are internal
    assert await db_session.scalar(select(func.count()).select_from(UserRestriction)) == 0
    # A pending case never adds a strike.
    assert await db_session.scalar(select(func.count()).select_from(UserStrike)) == 0
    # The other open report on the same audiobook was handled with this case.
    detail = (await client.get(f'/api/v1/admin/reports/{report_id}', headers=admin)).json()
    assert detail["other_reports"][0]["id"] == sibling and detail["other_reports"][0]["status"] == "resolved"
    assert any(h["action"] == "moderation.content.hidden" for h in detail["history"])
    assert detail["owner_record"]["flags"][0]["note"] == "Watch future uploads"

    case = (await client.get('/api/v1/me/moderation', headers=owner_tokens['headers'])).json()["cases"][0]
    assert case["can_appeal"] is True and {a["kind"] for a in case["actions"]} == {"hide", "notify"}


async def test_restriction_blocks_publishing_and_expires(client, db_session, owner_tokens, admin):
    _, _, report_id = await reported(client, db_session, owner_tokens)
    await client.post(f'/api/v1/admin/reports/{report_id}/actions', headers=admin, json={
        "violation": "copyright", "restrict_days": 7})
    draft = Audiobook(owner_id=UUID(owner_tokens['user']['id']), title="Next", language="bn",
                      visibility=AudiobookVisibility.PRIVATE, status=AudiobookStatus.COMPLETED,
                      channel_id=UUID(owner_tokens['channel_id']))
    db_session.add(draft)
    await db_session.commit()
    url = f'/api/v1/audiobooks/{draft.id}/visibility'
    blocked = await client.patch(url, headers=owner_tokens['headers'], json={"visibility": "PUBLIC"})
    assert blocked.status_code == 403 and "restricted" in blocked.json()["detail"]

    # Time passes: the restriction ends on its own.
    owner = await db_session.get(User, UUID(owner_tokens['user']['id']))
    owner.publishing_restricted_until = datetime.now(timezone.utc) - timedelta(minutes=1)
    await db_session.commit()
    assert (await client.patch(url, headers=owner_tokens['headers'], json={"visibility": "PUBLIC"})).status_code == 200


async def test_accepted_appeal_reverses_penalties(client, db_session, owner_tokens, admin):
    _, _, report_id = await reported(client, db_session, owner_tokens)
    await client.post(f'/api/v1/admin/reports/{report_id}/actions', headers=admin, json={
        "violation": "copyright", "hide": True, "restrict_days": 7, "flag_note": "check"})
    appeal = await client.post(f'/api/v1/moderation/cases/{report_id}/appeal', headers=owner_tokens['headers'], json={
        "reason": "own_rights", "explanation": "I am the author and hold the rights."})
    assert appeal.status_code == 200, appeal.text
    appeal_id = appeal.json()["id"]
    assert (await client.post(f'/api/v1/moderation/cases/{report_id}/appeal', headers=owner_tokens['headers'], json={
        "reason": "own_rights", "explanation": "Second attempt at appealing."})).status_code == 409
    assert (await client.post(f'/api/v1/appeals/{appeal_id}/evidence', headers=owner_tokens['headers'],
                              files={"file": ("licence.pdf", pdf(), "application/pdf")})).status_code == 200
    assert (await client.get('/api/v1/admin/attention', headers=admin)).json()["appeals"] == 1

    decided = await client.post(f'/api/v1/admin/appeals/{appeal_id}/decision', headers=admin, json={"action": "accept"})
    assert decided.status_code == 200, decided.text
    assert decided.json()["report_status"] == "resolved"
    assert (await client.get('/api/v1/audiobooks')).json()["total"] == 1
    owner = await db_session.get(User, UUID(owner_tokens['user']['id']))
    await db_session.refresh(owner)
    assert owner.publishing_restricted_until is None
    record = (await client.get(f"/api/v1/admin/users/{owner_tokens['user']['id']}/moderation", headers=admin)).json()
    assert record["active_strikes"] == 0 and not any(f["active"] for f in record["flags"])
    assert len(await notices(db_session, owner_tokens['user']['id'], "moderation.appeal_accepted")) == 1


async def test_rejected_appeal_confirms_with_strike_and_safe_delete(client, db_session, owner_tokens, admin):
    book, _, report_id = await reported(client, db_session, owner_tokens)
    await client.post(f'/api/v1/admin/reports/{report_id}/actions', headers=admin, json={"violation": "copyright", "hide": True})
    appeal_id = (await client.post(f'/api/v1/moderation/cases/{report_id}/appeal', headers=owner_tokens['headers'], json={
        "reason": "report_mistaken", "explanation": "This is my own original recording."})).json()["id"]
    url = f'/api/v1/admin/appeals/{appeal_id}/decision'
    # Deletion needs a written reason and the DELETE confirmation.
    assert (await client.post(url, headers=admin, json={"action": "reject"})).status_code == 422
    assert (await client.post(url, headers=admin, json={"action": "reject", "note": "Publisher's book",
                                                        "delete_content": True})).status_code == 422
    rejected = await client.post(url, headers=admin, json={"action": "reject", "note": "Publisher's book",
                                                           "delete_content": True, "confirm": "DELETE"})
    assert rejected.status_code == 200, rejected.text
    await db_session.refresh(book)
    assert book.publication_status == "deleted"
    record = (await client.get(f"/api/v1/admin/users/{owner_tokens['user']['id']}/moderation", headers=admin)).json()
    assert record["active_strikes"] == 1 and record["appeals"][0]["status"] == "rejected"
    [notice] = await notices(db_session, owner_tokens['user']['id'], "moderation.violation_confirmed")
    assert "Publisher's book" in notice.body
    # Records survive deletion.
    assert (await client.get(f'/api/v1/admin/reports/{report_id}', headers=admin)).json()["status"] == "resolved"
    assert await db_session.scalar(select(func.count()).select_from(Audit).where(
        Audit.action == "moderation.content.deleted")) == 1


async def test_second_strike_restricts_for_seven_days(client, db_session, owner_tokens, admin):
    for n in range(2):
        _, _, report_id = await reported(client, db_session, owner_tokens, email=f"reader{n}@example.com", username=f"reader{n}")
        confirmed = await client.post(f'/api/v1/admin/reports/{report_id}/confirm', headers=admin, json={"note": "Serious"})
        assert confirmed.status_code == 200, confirmed.text
    record = (await client.get(f"/api/v1/admin/users/{owner_tokens['user']['id']}/moderation", headers=admin)).json()
    assert record["active_strikes"] == 2 and record["status"] == "restricted"
    days = (datetime.fromisoformat(record["publishing_restricted_until"]) - datetime.now(timezone.utc)).days
    assert 6 <= days <= 7


async def test_dismissed_report_closes_without_penalty(client, db_session, owner_tokens, admin):
    _, _, report_id = await reported(client, db_session, owner_tokens)
    dismissed = await client.post(f'/api/v1/admin/reports/{report_id}/dismiss', headers=admin, json={"note": "Licensed"})
    assert dismissed.json()["status"] == "dismissed"
    assert (await client.get('/api/v1/me/moderation', headers=owner_tokens['headers'])).json()["cases"] == []
    assert await db_session.scalar(select(func.count()).select_from(UserStrike)) == 0
