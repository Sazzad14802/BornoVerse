"""
Deleting an account removes everything that belongs to it; deleting a channel
keeps its audiobooks with the publisher (private) and allows a new channel.
"""

from uuid import UUID

from sqlalchemy import func, select

from app.models import Audiobook, User
from app.models.notification import Notification
from app.models.platform import Audit, Channel, Playlist, Report
from app.models.social import ChannelFollow
from tests.test_platform import account, public_book


async def count(db, model, *where):
    return await db.scalar(select(func.count()).select_from(model).where(*where))


async def test_delete_account_removes_everything(client, db_session, owner_tokens):
    owner_id = UUID(owner_tokens['user']['id'])
    headers = owner_tokens['headers']
    book = await public_book(db_session, owner_tokens['user'])
    fan_user, fan = await account(client, email="fan@example.com", username="fanuser")
    await client.put(f"/api/v1/channels/{owner_tokens['channel_id']}/follow", headers=fan, json={"notify": True})
    await client.post('/api/v1/library', headers=fan, json={"audiobook_id": str(book.id)})
    await client.post('/api/v1/reports', headers=fan, json={"audiobook_id": str(book.id), "category": "copyright", "details": "Copied"})
    await client.post('/api/v1/playlists', headers=headers, json={"name": "Classics", "channel": True})

    assert (await client.post('/api/v1/users/me/delete', headers=headers, json={"confirm": "nope"})).status_code == 422
    deleted = await client.post('/api/v1/users/me/delete', headers=headers, json={"confirm": "DELETE"})
    assert deleted.status_code == 200, deleted.text

    db_session.expire_all()
    assert await db_session.get(User, owner_id) is None
    assert await count(db_session, Audiobook, Audiobook.owner_id == owner_id) == 0
    assert await count(db_session, Channel, Channel.owner_id == owner_id) == 0
    assert await count(db_session, Playlist, Playlist.user_id == owner_id) == 0
    assert await count(db_session, ChannelFollow) == 0
    assert await count(db_session, Report) == 0
    assert await count(db_session, Notification, Notification.user_id == owner_id) == 0
    # The fan's own account is untouched; the audit trail stays without the person.
    assert await db_session.get(User, UUID(fan_user['id'])) is not None
    assert await count(db_session, Audit, Audit.actor_id == owner_id) == 0
    assert (await client.get('/api/v1/users/me', headers=headers)).status_code == 401
    assert (await client.get('/api/v1/audiobooks')).json()['total'] == 0


async def test_delete_channel_keeps_audiobooks_private(client, db_session, owner_tokens):
    headers = owner_tokens['headers']
    book = await public_book(db_session, owner_tokens['user'])
    # Keep the single channel of the fixture: move the book into it.
    channel_id = owner_tokens['channel_id']
    extra = book.channel_id
    book.channel_id = UUID(channel_id)
    await db_session.delete(await db_session.get(Channel, extra))
    await db_session.commit()
    book_id = book.id
    _, fan = await account(client, email="fan@example.com", username="fanuser")
    await client.put(f"/api/v1/channels/{channel_id}/follow", headers=fan, json={})
    assert (await client.get('/api/v1/audiobooks')).json()['total'] == 1

    _, stranger = await account(client, email="x@example.com", username="stranger")
    assert (await client.delete(f'/api/v1/publisher/channels/{channel_id}', headers=stranger)).status_code == 404
    gone = await client.delete(f'/api/v1/publisher/channels/{channel_id}', headers=headers)
    assert gone.status_code == 200, gone.text
    assert gone.json()["audiobooks_kept"] == 1

    db_session.expire_all()
    kept = await db_session.get(Audiobook, book_id)
    assert kept is not None and kept.channel_id is None and kept.visibility.value == "PRIVATE"
    assert (await client.get('/api/v1/audiobooks')).json()['total'] == 0
    assert await count(db_session, ChannelFollow) == 0
    assert any(b["id"] == str(book_id) for b in (await client.get('/api/v1/audiobooks/my', headers=headers)).json()["items"])

    again = await client.post('/api/v1/publisher/channels', headers=headers, json={"name": "Fresh start"})
    assert again.status_code == 200, again.text
    assert (await client.post('/api/v1/publisher/channels', headers=headers, json={"name": "Two"})).status_code == 409
