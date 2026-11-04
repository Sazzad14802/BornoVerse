"""
Password recovery codes, favourites, recommendations, channel follows with
bell notifications, the following feed, and channel playlists.
"""

from uuid import UUID

from sqlalchemy import select

from app.core.config import settings
from app.models import Audiobook, AudiobookStatus, AudiobookVisibility
from app.models.notification import Notification
from app.models.platform import Channel
from tests.test_platform import account, public_book


async def owner_channel(db_session, owner_tokens) -> Channel:
    return await db_session.get(Channel, UUID(owner_tokens['channel_id']))


# ── Password recovery ───────────────────────────────────────────────────────

async def test_recovery_code_flow(client, monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "development")
    monkeypatch.setattr(settings, "BREVO_API_KEY", "")
    monkeypatch.setattr(settings, "SMTP_HOST", "")
    await account(client, email="reader@example.com", username="reader")

    sent = await client.post('/api/v1/auth/recovery', json={"email": "reader@example.com"})
    assert sent.status_code == 200, sent.text
    code = sent.json()["dev_code"]
    # Unknown emails get the same reply and no code.
    assert "dev_code" not in (await client.post('/api/v1/auth/recovery', json={"email": "nobody@example.com"})).json()
    # Resending too quickly is refused.
    assert (await client.post('/api/v1/auth/recovery', json={"email": "reader@example.com"})).status_code == 429

    wrong = "000000" if code != "000000" else "111111"
    assert (await client.post('/api/v1/auth/recovery/verify', json={"email": "reader@example.com", "code": wrong})).status_code == 400
    verified = await client.post('/api/v1/auth/recovery/verify', json={"email": "reader@example.com", "code": code})
    assert verified.status_code == 200, verified.text
    # A code works once.
    assert (await client.post('/api/v1/auth/recovery/verify', json={"email": "reader@example.com", "code": code})).status_code == 400

    reset = await client.post('/api/v1/auth/reset-password', json={"token": verified.json()["token"], "password": "BrandNew123!"})
    assert reset.status_code == 200, reset.text
    login = await client.post('/api/v1/auth/login', json={"username_or_email": "reader@example.com", "password": "BrandNew123!"})
    assert login.status_code == 200


async def test_recovery_code_locks_after_five_wrong_attempts(client, monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "development")
    monkeypatch.setattr(settings, "BREVO_API_KEY", "")
    monkeypatch.setattr(settings, "SMTP_HOST", "")
    await account(client, email="reader@example.com", username="reader")
    code = (await client.post('/api/v1/auth/recovery', json={"email": "reader@example.com"})).json()["dev_code"]
    wrong = "000000" if code != "000000" else "111111"
    for _ in range(5):
        await client.post('/api/v1/auth/recovery/verify', json={"email": "reader@example.com", "code": wrong})
    locked = await client.post('/api/v1/auth/recovery/verify', json={"email": "reader@example.com", "code": code})
    assert locked.status_code == 400


async def test_recovery_needs_email_in_production(client, monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    monkeypatch.setattr(settings, "BREVO_API_KEY", "")
    monkeypatch.setattr(settings, "SMTP_HOST", "")
    assert (await client.post('/api/v1/auth/recovery', json={"email": "a@example.com"})).status_code == 503


# ── Favourites and recommendations ──────────────────────────────────────────

async def test_favourites_need_five_and_drive_recommendations(client, db_session, owner_tokens):
    _, headers = await account(client)
    status = (await client.get('/api/v1/me/favourites', headers=headers)).json()
    assert status["required"] is True and status["minimum"] == 5

    assert (await client.put('/api/v1/me/favourites', headers=headers,
                             json={"genres": ["poetry", "novel"]})).status_code == 422
    book = await public_book(db_session, owner_tokens['user'])
    book.genre = "poetry"
    other = Audiobook(owner_id=book.owner_id, title="Science notes", language="bn", genre="science",
                      visibility=AudiobookVisibility.PUBLIC, status=AudiobookStatus.COMPLETED,
                      publication_status="published", channel_id=book.channel_id)
    db_session.add(other)
    await db_session.commit()

    saved = await client.put('/api/v1/me/favourites', headers=headers,
                             json={"genres": ["poetry", "novel", "story", "history", "children"]})
    assert saved.status_code == 200, saved.text
    assert (await client.get('/api/v1/me/favourites', headers=headers)).json()["required"] is False

    recommended = (await client.get('/api/v1/me/recommendations', headers=headers)).json()
    assert recommended["basis"] == "favourites"
    assert recommended["items"][0]["title"] == "Published story"
    assert {b["title"] for b in recommended["items"]} == {"Published story", "Science notes"}


# ── Follows, bell notifications and feed ────────────────────────────────────

async def test_follow_bell_notifies_only_on_first_publish(client, db_session, owner_tokens):
    fan, fan_headers = await account(client, email="fan@example.com", username="fan")
    quiet, quiet_headers = await account(client, email="quiet@example.com", username="quiet")
    channel_id = owner_tokens['channel_id']

    followed = await client.put(f'/api/v1/channels/{channel_id}/follow', headers=fan_headers, json={"notify": True})
    assert followed.status_code == 200, followed.text
    assert followed.json()["following"] is True and followed.json()["notify"] is True
    await client.put(f'/api/v1/channels/{channel_id}/follow', headers=quiet_headers, json={"notify": False})
    profile = (await client.get(f'/api/v1/channels/{channel_id}', headers=fan_headers)).json()
    assert profile["followers"] == 2
    # Owners cannot follow themselves.
    assert (await client.put(f'/api/v1/channels/{channel_id}/follow', headers=owner_tokens['headers'],
                             json={})).status_code == 409

    book = Audiobook(owner_id=UUID(owner_tokens['user']['id']), title="New tale", language="bn",
                     visibility=AudiobookVisibility.PRIVATE, status=AudiobookStatus.COMPLETED,
                     publication_status="draft", channel_id=UUID(channel_id))
    db_session.add(book)
    await db_session.commit()
    url = f'/api/v1/audiobooks/{book.id}/visibility'
    assert (await client.patch(url, headers=owner_tokens['headers'], json={"visibility": "PUBLIC"})).status_code == 200

    async def notices(user):
        return (await db_session.scalars(select(Notification).where(
            Notification.user_id == UUID(user['id']), Notification.kind == "channel.new_audiobook"))).all()

    assert len(await notices(fan)) == 1 and (await notices(fan))[0].body == "New tale"
    assert await notices(quiet) == []

    # Unpublishing and publishing again does not notify twice.
    await client.patch(url, headers=owner_tokens['headers'], json={"visibility": "PRIVATE"})
    await client.patch(url, headers=owner_tokens['headers'], json={"visibility": "PUBLIC"})
    assert len(await notices(fan)) == 1

    feed = (await client.get('/api/v1/me/feed', headers=fan_headers)).json()
    assert [b["title"] for b in feed] == ["New tale"]
    following = (await client.get('/api/v1/me/following', headers=fan_headers)).json()
    assert following[0]["id"] == channel_id and following[0]["notify"] is True

    assert (await client.delete(f'/api/v1/channels/{channel_id}/follow', headers=fan_headers)).json()["following"] is False
    assert (await client.get('/api/v1/me/feed', headers=fan_headers)).json() == []


# ── Publisher channel ───────────────────────────────────────────────────────

async def test_one_channel_and_channel_playlists(client, db_session, owner_tokens):
    headers = owner_tokens['headers']
    assert (await client.post('/api/v1/publisher/channels', headers=headers, json={"name": "Second"})).status_code == 409

    playlist = await client.post('/api/v1/playlists', headers=headers, json={"name": "Classics", "channel": True})
    assert playlist.status_code == 200, playlist.text
    playlist_id = playlist.json()["id"]
    assert playlist.json()["channel_id"] == owner_tokens['channel_id']

    in_channel = Audiobook(owner_id=UUID(owner_tokens['user']['id']), title="Channel book", language="bn",
                           visibility=AudiobookVisibility.PUBLIC, status=AudiobookStatus.COMPLETED,
                           publication_status="published", channel_id=UUID(owner_tokens['channel_id']))
    private = Audiobook(owner_id=UUID(owner_tokens['user']['id']), title="Private book", language="bn",
                        visibility=AudiobookVisibility.PRIVATE, status=AudiobookStatus.COMPLETED)
    db_session.add_all([in_channel, private])
    await db_session.commit()

    assert (await client.put(f'/api/v1/playlists/{playlist_id}/books/{in_channel.id}', headers=headers)).status_code == 200
    assert (await client.put(f'/api/v1/playlists/{playlist_id}/books/{private.id}', headers=headers)).status_code == 409

    channel_lists = (await client.get('/api/v1/playlists?scope=channel', headers=headers)).json()
    assert channel_lists[0]["count"] == 1
    assert (await client.get('/api/v1/playlists', headers=headers)).json() == []

    _, listener = await account(client, email="listener@example.com", username="listener")
    page = (await client.get(f"/api/v1/channels/{owner_tokens['channel_id']}", headers=listener)).json()
    assert page["playlists"][0]["name"] == "Classics"
    assert [b["title"] for b in page["playlists"][0]["audiobooks"]] == ["Channel book"]

    # Listeners cannot create channel playlists.
    assert (await client.post('/api/v1/playlists', headers=listener, json={"name": "Mine", "channel": True})).status_code == 403


async def test_catalog_shows_channel_name_and_channels_are_searchable(client, db_session, owner_tokens):
    await public_book(db_session, owner_tokens['user'])
    catalog = (await client.get('/api/v1/audiobooks')).json()["items"]
    assert catalog[0]["channel_name"] == "Stories"

    _, headers = await account(client)
    found = (await client.get('/api/v1/channels?q=stor', headers=headers)).json()
    assert [c["name"] for c in found] == ["Stories"]
    await client.put(f"/api/v1/channels/{found[0]['id']}/follow", headers=headers, json={"notify": True})
    again = (await client.get('/api/v1/channels?q=stor', headers=headers)).json()[0]
    assert again["following"] is True and again["notify"] is True and again["followers"] == 1
    assert (await client.get('/api/v1/channels?q=zzz', headers=headers)).json() == []


async def test_registration_needs_email_code(client, monkeypatch):
    monkeypatch.setattr(settings, "REQUIRE_EMAIL_VERIFICATION", True)
    monkeypatch.setattr(settings, "ENVIRONMENT", "development")
    monkeypatch.setattr(settings, "BREVO_API_KEY", "")
    monkeypatch.setattr(settings, "SMTP_HOST", "")
    body = {"username": "newreader", "email": "new@example.com", "password": "Reading2026"}
    # Weak passwords are refused.
    assert (await client.post('/api/v1/auth/register', json={**body, "password": "short1"})).status_code == 422
    assert (await client.post('/api/v1/auth/register', json={**body, "password": "onlyletters"})).status_code == 422
    # No code, no account.
    assert (await client.post('/api/v1/auth/register', json=body)).status_code == 400

    started = await client.post('/api/v1/auth/register/start', json={"email": "New@Example.com", "username": "newreader"})
    assert started.status_code == 200, started.text
    code = started.json()["dev_code"]
    wrong = "000000" if code != "000000" else "111111"
    assert (await client.post('/api/v1/auth/register', json={**body, "email_code": wrong})).status_code == 400
    created = await client.post('/api/v1/auth/register', json={**body, "email_code": code})
    assert created.status_code == 201, created.text
    # The code works once, and a taken email cannot start again.
    assert (await client.post('/api/v1/auth/register/start', json={"email": "new@example.com"})).status_code == 409


async def test_registration_without_verification_when_disabled(client, monkeypatch):
    monkeypatch.setattr(settings, "REQUIRE_EMAIL_VERIFICATION", False)
    started = await client.post('/api/v1/auth/register/start', json={"email": "free@example.com"})
    assert started.json() == {"verification_required": False}
    assert (await client.post('/api/v1/auth/register', json={
        "username": "freeuser", "email": "free@example.com", "password": "Reading2026"})).status_code == 201


PNG = bytes.fromhex(
    "89504e470d0a1a0a0000000d4948445200000001000000010806000000"
    "1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082")


async def test_profile_and_channel_pictures(client, owner_tokens):
    headers = owner_tokens['headers']
    me = await client.post('/api/v1/users/me/avatar', headers=headers, files={"file": ("me.png", PNG, "image/png")})
    assert me.status_code == 200, me.text
    url = me.json()["avatar_url"]
    assert url.startswith("/api/v1/covers/") and (await client.get(url)).status_code == 200
    bad = await client.post('/api/v1/users/me/avatar', headers=headers, files={"file": ("x.txt", b"hello", "text/plain")})
    assert bad.status_code == 400
    assert (await client.delete('/api/v1/users/me/avatar', headers=headers)).json()["avatar_url"] is None

    channel_id = owner_tokens['channel_id']
    logo = await client.post(f'/api/v1/publisher/channels/{channel_id}/avatar', headers=headers,
                             files={"file": ("logo.png", PNG, "image/png")})
    assert logo.status_code == 200, logo.text
    _, listener = await account(client, email="l@example.com", username="listener")
    assert (await client.get(f'/api/v1/channels/{channel_id}', headers=listener)).json()["avatar_url"] == logo.json()["avatar_url"]
    assert (await client.post(f'/api/v1/publisher/channels/{channel_id}/avatar', headers=listener,
                              files={"file": ("logo.png", PNG, "image/png")})).status_code == 404


async def test_language_and_english_notifications(client, db_session, owner_tokens):
    fan, headers = await account(client, email="fan@example.com", username="fanuser")
    updated = await client.patch('/api/v1/users/me', headers=headers, json={"language": "en"})
    assert updated.status_code == 200 and updated.json()["language"] == "en"
    assert (await client.patch('/api/v1/users/me', headers=headers, json={"language": "fr"})).status_code == 422
    await client.put(f"/api/v1/channels/{owner_tokens['channel_id']}/follow", headers=headers, json={"notify": True})
    book = Audiobook(owner_id=UUID(owner_tokens['user']['id']), title="New tale", language="bn",
                     visibility=AudiobookVisibility.PRIVATE, status=AudiobookStatus.COMPLETED,
                     publication_status="draft", channel_id=UUID(owner_tokens['channel_id']))
    db_session.add(book)
    await db_session.commit()
    await client.patch(f'/api/v1/audiobooks/{book.id}/visibility', headers=owner_tokens['headers'], json={"visibility": "PUBLIC"})
    notice = (await client.get('/api/v1/notifications', headers=headers)).json()[0]
    assert notice["data"]["title_en"].endswith(": new audiobook") and notice["data"]["body_en"] == "New tale"
