from datetime import datetime, timezone, timedelta
from decimal import Decimal
from io import BytesIO
from uuid import UUID, uuid4
import pytest
from pypdf import PdfWriter
from sqlalchemy import select, func
from app.core.config import settings
from app.core.security import hash_password, create_access_token
from app.models import User, Audiobook, AudiobookStatus, AudiobookVisibility, Chapter, GenerationJob
from app.models.platform import Channel, Setting, Plan, Order, Audit, EligibleView, Ledger, PlaySession, Withdrawal
from app.services.auth_service import create_user_token
from app.services.policy import DEFAULTS, month_now
from app.services.billing import allocate
from app.services.scheduler import priority_key, claim

def pdf():
    writer=PdfWriter();writer.add_blank_page(width=100,height=100);buffer=BytesIO();writer.write(buffer);return buffer.getvalue()

def mp3():
    # 40 silent MPEG-1 Layer III frames (128 kbps, 44.1 kHz): about one second.
    return (b'\xff\xfb\x90\x00'+b'\x00'*413)*40

async def account(client, email="shared@example.com", password="Password123!", username="sameuser"):
    result=await client.post('/api/v1/auth/register',json={"username":username,"email":email,"password":password})
    assert result.status_code==201,result.text
    login=await client.post('/api/v1/auth/login',json={"username_or_email":email,"password":password})
    assert login.status_code==200,login.text
    return result.json(), {"Authorization":"Bearer "+login.json()['access_token']}

@pytest.fixture
async def admin(db_session):
    user=User(username="administrator",email="admin@example.com",password_hash=hash_password("VeryStrongPassword!"),account_type="admin")
    db_session.add(user);db_session.add(Setting(key="policy",value=DEFAULTS));await db_session.commit()
    return {"Authorization":"Bearer "+create_user_token(user).access_token}

@pytest.fixture
def mock_payments(monkeypatch):
    monkeypatch.setattr(settings,"MOCK_PAYMENTS_ENABLED",True)
    monkeypatch.setattr(settings,"ENVIRONMENT","development")

async def public_book(db, publisher, tier="premium"):
    channel=Channel(owner_id=UUID(publisher['id']),name="Stories");db.add(channel);await db.flush()
    book=Audiobook(owner_id=UUID(publisher['id']),title="Published story",language="bn",visibility=AudiobookVisibility.PUBLIC,
        status=AudiobookStatus.COMPLETED,publication_status="published",access_tier=tier,channel_id=channel.id)
    db.add(book);await db.flush()
    db.add(Chapter(audiobook_id=book.id,title="Second",chapter_number=2,audio_url="/uploads/audio/second.wav",duration_seconds=80))
    db.add(Chapter(audiobook_id=book.id,title="First",chapter_number=1,audio_url="/uploads/audio/first.wav",duration_seconds=80))
    await db.commit();return book

async def test_single_account_and_admin_guards(client,db_session,admin):
    user,lh=await account(client)
    assert user['account_type']=='user' and user['publisher_status']=='none'
    duplicate=await client.post('/api/v1/auth/register',json={"username":"otherName","email":"shared@example.com","password":"Password123!"})
    assert duplicate.status_code==409
    escalated=await client.post('/api/v1/auth/register',json={"username":"eviladmin","email":"evil@example.com","password":"Password123!","account_type":"admin"})
    assert escalated.status_code==201 and escalated.json()['account_type']=='user'
    assert (await client.post('/api/v1/auth/login',json={"username_or_email":"admin@example.com","password":"VeryStrongPassword!"})).status_code==401
    assert (await client.get('/api/v1/admin/users',headers=lh)).status_code==403
    assert (await client.get('/api/v1/admin/users')).status_code==401
    assert (await client.get('/api/v1/admin/users',headers=admin)).status_code==200
    # Every user can create privately; publishing needs verification.
    assert (await client.post('/api/v1/audiobooks',headers=lh,json={"title":"Mine"})).status_code==201
    assert (await client.post('/api/v1/audiobooks',headers=lh,json={"title":"Private only","visibility":"PUBLIC"})).status_code==403
    assert (await client.post('/api/v1/publisher/channels',headers=lh,json={"name":"Channel"})).status_code==403
    forged=create_access_token(user['id'],extra_claims={"purpose":"access","ver":0,"role":"admin"})
    assert (await client.get('/api/v1/admin/users',headers={"Authorization":"Bearer "+forged})).status_code==403

async def test_publisher_workflow_payment_and_suspension(client,db_session,admin,mock_payments):
    publisher,headers=await account(client)
    assert (await client.post('/api/v1/publisher/channels',headers=headers,json={"name":"Channel"})).status_code==403
    assert (await client.post('/api/v1/payments',headers=headers,json={"kind":"publisher_registration","idempotency_key":"registration"})).status_code==403
    submitted=await client.post('/api/v1/publisher/applications',headers=headers,data={"legal_name":"Test Publisher"},files={"file":("proof.pdf",pdf(),"application/pdf")})
    assert submitted.status_code==200,submitted.text
    application=submitted.json()['id']
    rejected=await client.post(f'/api/v1/admin/applications/{application}/decision',headers=admin,json={"action":"reject","reason":"Please resubmit clear proof"})
    assert rejected.status_code==200
    submitted=await client.post('/api/v1/publisher/applications',headers=headers,data={"legal_name":"Test Publisher"},files={"file":("proof.pdf",pdf(),"application/pdf")})
    application=submitted.json()['id']
    assert (await client.post(f'/api/v1/admin/applications/{application}/decision',headers=admin,json={"action":"approve","reason":"Documents verified"})).status_code==200
    order=(await client.post('/api/v1/payments',headers=headers,json={"kind":"publisher_registration","idempotency_key":"registration"})).json()
    assert Decimal(order['amount'])==Decimal('500')
    for _ in range(2):
        assert (await client.post(f"/api/v1/payments/{order['id']}/mock-confirm",headers=headers,json={"status":"success"})).status_code==200
    assert (await client.post('/api/v1/publisher/channels',headers=headers,json={"name":"Channel"})).status_code==200
    book=await public_book(db_session,publisher,'free')
    assert (await client.get('/api/v1/audiobooks')).json()['total']==1
    await client.post(f"/api/v1/admin/users/{publisher['id']}/decision",headers=admin,json={"action":"suspend","reason":"Review account"})
    assert (await client.get('/api/v1/audiobooks')).json()['total']==0
    assert (await client.get('/api/v1/users/me',headers=headers)).status_code in (401,403)
    await client.post(f'/api/v1/admin/moderation/audiobooks/{book.id}',headers=admin,json={"action":"restrict","reason":"Independent restriction"})
    await client.post(f"/api/v1/admin/users/{publisher['id']}/decision",headers=admin,json={"action":"unsuspend","reason":"Account restored"})
    assert (await client.get('/api/v1/audiobooks')).json()['total']==0
    await client.post(f'/api/v1/admin/moderation/audiobooks/{book.id}',headers=admin,json={"action":"restore","reason":"Content cleared"})
    assert (await client.get('/api/v1/audiobooks')).json()['total']==1
    assert await db_session.scalar(select(func.count()).select_from(Audit))>=7

async def test_subscription_payment_states_and_media(client,db_session,owner_tokens,mock_payments):
    listener,headers=await account(client)
    plan=Plan(name="Monthly",months=1,price=Decimal('150'));db_session.add(plan);await db_session.commit()
    book=await public_book(db_session,owner_tokens['user'])
    assert (await client.post(f'/api/v1/audiobooks/{book.id}/play',headers=headers)).status_code==403
    for outcome in ['failed','cancelled','success']:
        order=await client.post('/api/v1/payments',headers=headers,json={"kind":"subscription","plan_id":str(plan.id),"idempotency_key":"order-"+outcome})
        assert order.status_code==200,order.text
        id=order.json()['id']
        duplicate=await client.post('/api/v1/payments',headers=headers,json={"kind":"subscription","plan_id":str(plan.id),"idempotency_key":"order-"+outcome})
        assert duplicate.json()['id']==id
        response=await client.post(f'/api/v1/payments/{id}/mock-confirm',headers=headers,json={"status":outcome})
        assert response.status_code==200
        if outcome!='success':
            assert (await client.post(f'/api/v1/payments/{id}/mock-confirm',headers=headers,json={"status":"success"})).status_code==409
    result=await client.post(f'/api/v1/audiobooks/{book.id}/play',headers=headers)
    assert result.status_code==200,result.text
    assert [c['chapter_number'] for c in result.json()['chapters']]==[1,2]
    grant_url=result.json()['chapters'][0]['audio_url']
    assert (await client.get('/uploads/audio/first.wav')).status_code==404
    user=await db_session.get(User,UUID(listener['id']));user.premium_until=datetime.now(timezone.utc)-timedelta(seconds=1);await db_session.commit()
    assert (await client.get(grant_url)).status_code==403
    assert (await client.post(f'/api/v1/audiobooks/{book.id}/offline-license',headers=headers)).status_code==403

async def test_mock_disabled_in_production(client,db_session,monkeypatch):
    _,headers=await account(client)
    monkeypatch.setattr(settings,'ENVIRONMENT','production');monkeypatch.setattr(settings,'MOCK_PAYMENTS_ENABLED',True)
    result=await client.post('/api/v1/payments',headers=headers,json={"kind":"subscription","idempotency_key":"disabled-test"})
    assert result.status_code==503

async def test_quota_duplicate_cancel_and_private_isolation(client,db_session,admin):
    _,headers=await account(client)
    settings_row=await db_session.get(Setting,'policy');settings_row.value=DEFAULTS|{'free_quota':1};await db_session.commit()
    book=(await client.post('/api/v1/audiobooks',headers=headers,json={"title":"Private book"})).json()
    upload=await client.post(f"/api/v1/audiobooks/{book['id']}/source",headers=headers,files={"file":('book.pdf',pdf(),'application/pdf')})
    assert upload.status_code==200
    first=await client.post(f"/api/v1/audiobooks/{book['id']}/generate",headers=headers)
    second=await client.post(f"/api/v1/audiobooks/{book['id']}/generate",headers=headers)
    assert first.status_code==202,first.text
    assert first.json()['job_id']==second.json()['job_id']
    assert (await client.get('/api/v1/generation/quota',headers=headers)).json()['used']==1
    assert (await client.get(f"/api/v1/audiobooks/{book['id']}")).status_code==404
    assert (await client.get(upload.json()['source_file_url'])).status_code==404
    await client.post(f"/api/v1/generation/{first.json()['job_id']}/cancel",headers=headers)
    assert (await client.post(f"/api/v1/audiobooks/{book['id']}/generate",headers=headers)).status_code==429
    assert (await client.post('/api/v1/audiobooks/generation-callback',json={"job_id":first.json()['job_id'],"audiobook_id":book['id'],"status":"COMPLETED"})).status_code==410

async def test_channel_publishing_and_mp3_chapters(client,db_session,owner_tokens,other_tokens,tmp_path,monkeypatch):
    monkeypatch.setattr(settings,"UPLOAD_DIR",str(tmp_path))
    headers,channel=owner_tokens['headers'],owner_tokens['channel_id']
    assert (await client.post('/api/v1/audiobooks',headers=headers,json={"title":"Loose","visibility":"PUBLIC"})).status_code==409
    book=(await client.post('/api/v1/audiobooks',headers=headers,json={"title":"Narrated","channel_id":channel})).json()
    files=[("files",(f"Part {n}.mp3",mp3(),"audio/mpeg")) for n in (1,2)]
    other=(await client.post('/api/v1/audiobooks',headers=other_tokens['headers'],json={"title":"Not a publisher"})).json()
    assert (await client.post(f"/api/v1/audiobooks/{other['id']}/audio",headers=other_tokens['headers'],files=files)).status_code==403
    uploaded=await client.post(f"/api/v1/audiobooks/{book['id']}/audio",headers=headers,files=files)
    assert uploaded.status_code==200,uploaded.text
    assert uploaded.json()['chapters']==2
    chapters=(await client.get(f"/api/v1/audiobooks/{book['id']}/chapters",headers=headers)).json()
    assert [c['title'] for c in chapters]==['Part 1','Part 2']
    assert (await client.patch(f"/api/v1/audiobooks/{book['id']}/visibility",headers=headers,json={"visibility":"PUBLIC"})).status_code==200
    assert (await client.get('/api/v1/audiobooks')).json()['total']==1
    # Leaving the channel takes the audiobook out of public listings.
    assert (await client.patch(f"/api/v1/audiobooks/{book['id']}",headers=headers,json={"channel_id":None})).status_code==200
    assert (await client.get('/api/v1/audiobooks')).json()['total']==0

def test_priority_aging_and_rounding():
    now=datetime.now(timezone.utc)
    old=GenerationJob(id=uuid4(),priority=0,created_at=now-timedelta(hours=1))
    new=GenerationJob(id=uuid4(),priority=2,created_at=now)
    assert priority_key(old,now,300)<priority_key(new,now,300)
    result=allocate(Decimal('1.00'),{'a':1,'b':1,'c':1})
    assert result=={'a':Decimal('.34'),'b':Decimal('.33'),'c':Decimal('.33')}
    assert allocate(Decimal('100'),{})=={}

async def test_scheduler_fairness_and_recovery(db_session,owner_tokens,other_tokens,admin):
    users=[UUID(owner_tokens['user']['id']),UUID(other_tokens['user']['id'])]
    jobs=[]
    for owner in [users[0],users[0],users[1]]:
        book=Audiobook(owner_id=owner,title='Queue');db_session.add(book);await db_session.flush()
        job=GenerationJob(owner_id=owner,audiobook_id=book.id,priority=2 if owner==users[0] else 0);db_session.add(job);jobs.append(job)
    await db_session.commit()
    first=await claim(db_session);second=await claim(db_session)
    assert first and second
    assert (await db_session.get(GenerationJob,first[0])).owner_id != (await db_session.get(GenerationJob,second[0])).owner_id
    assert await claim(db_session) is None
    job=await db_session.get(GenerationJob,first[0]);job.lease_until=datetime.now(timezone.utc)-timedelta(seconds=5);await db_session.commit()
    recovered=await claim(db_session)
    assert recovered and recovered[1]!=first[1]

async def test_eligible_views_deduplicated_and_withdrawal_audit(client,db_session,owner_tokens,admin):
    listener,headers=await account(client)
    user=await db_session.get(User,UUID(listener['id']));user.premium_until=datetime.now(timezone.utc)+timedelta(days=1)
    book=await public_book(db_session,owner_tokens['user'])
    for _ in range(2):
        result=(await client.post(f'/api/v1/audiobooks/{book.id}/play',headers=headers)).json()
        session=await db_session.get(PlaySession,UUID(result['session_id']))
        session.seconds=55;session.last_heartbeat=datetime.now(timezone.utc)-timedelta(seconds=10);await db_session.commit()
        response=await client.post(f"/api/v1/plays/{session.id}/heartbeat",headers=headers,json={"position":10})
        assert response.status_code==200,response.text
    assert await db_session.scalar(select(func.count()).select_from(EligibleView))==1
    publisher_id=UUID(owner_tokens['user']['id'])
    db_session.add(Ledger(publisher_id=publisher_id,month='2026-01',amount=Decimal('100'),kind='earning',reference='test-earning'));await db_session.commit()
    response=await client.post('/api/v1/publisher/withdrawals',headers=owner_tokens['headers'],json={"amount":"75.00","destination":"mock-wallet"})
    assert response.status_code==200,response.text
    assert (await client.post('/api/v1/publisher/withdrawals',headers=owner_tokens['headers'],json={"amount":"75.00","destination":"mock-wallet"})).status_code==409
    id=response.json()['id']
    for action in ['approve','complete']:
        assert (await client.post(f'/api/v1/admin/withdrawals/{id}/decision',headers=admin,json={"action":action,"reason":"Test simulated settlement"})).status_code==200
    assert (await client.post(f'/api/v1/admin/withdrawals/{id}/decision',headers=admin,json={"action":"complete","reason":"Duplicate completion"})).status_code==409
    assert (await client.get('/api/v1/publisher/dashboard',headers=owner_tokens['headers'])).json()['available_balance']=='25.00'

async def test_premium_can_only_upgrade_and_gets_invoices(client,db_session,mock_payments):
    _,headers=await account(client)
    monthly=Plan(name="Monthly",months=1,price=Decimal('150'));yearly=Plan(name="Yearly",months=12,price=Decimal('1200'))
    db_session.add_all([monthly,yearly]);await db_session.commit()
    current=(await client.get('/api/v1/subscriptions/current',headers=headers)).json()
    assert current['plan'] is None and len(current['upgrade_plan_ids'])==2 and current['is_highest'] is False

    async def buy(plan,key):
        return await client.post('/api/v1/payments',headers=headers,json={"kind":"subscription","plan_id":str(plan.id),"idempotency_key":"order-key-"+key})
    first=await buy(monthly,"m1");assert first.status_code==200,first.text;order=first.json()
    await client.post(f"/api/v1/payments/{order['id']}/mock-confirm",headers=headers,json={"status":"success"})
    current=(await client.get('/api/v1/subscriptions/current',headers=headers)).json()
    assert current['plan']['name']=="Monthly" and current['upgrade_plan_ids']==[str(yearly.id)]
    # The same plan again is refused while Premium is active; a longer one is an upgrade.
    assert (await buy(monthly,"m2")).status_code==409
    upgrade=(await buy(yearly,"y1")).json()
    await client.post(f"/api/v1/payments/{upgrade['id']}/mock-confirm",headers=headers,json={"status":"success"})
    current=(await client.get('/api/v1/subscriptions/current',headers=headers)).json()
    assert current['plan']['name']=="Yearly" and current['is_highest'] is True
    assert (await buy(yearly,"y2")).status_code==409

    invoice=(await client.get(f"/api/v1/payments/{upgrade['id']}/invoice",headers=headers)).json()
    assert invoice['amount']=="1200.00" and invoice['invoice_number'].startswith("BV-") and "Yearly" in invoice['item']
    _,other=await account(client,email="other@example.com",username="otheruser")
    assert (await client.get(f"/api/v1/payments/{upgrade['id']}/invoice",headers=other)).status_code==404
