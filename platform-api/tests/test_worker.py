from io import BytesIO
import wave
from datetime import datetime, timezone, timedelta
import httpx
from pypdf import PdfWriter
from sqlalchemy import select
from app.models import User, Audiobook, GenerationJob, Chapter, AudiobookStatus
from app.models.platform import Setting
from app.services.policy import DEFAULTS
from app.services.scheduler import claim
from app import worker
from app.core.config import settings
from tests.conftest import TestingSessionLocal

async def test_progressive_worker_retry_preserves_order(db_session,tmp_path,monkeypatch):
    monkeypatch.setattr(settings,'UPLOAD_DIR',str(tmp_path))
    monkeypatch.setattr(worker,'async_session_maker',TestingSessionLocal)
    writer=PdfWriter();writer.add_blank_page(width=100,height=100);writer.add_blank_page(width=100,height=100)
    path=tmp_path/'input.pdf';writer.write(path)
    user=User(username='workeruser',email='worker@example.com',password_hash='not-used');db_session.add(user);await db_session.flush()
    book=Audiobook(owner_id=user.id,title='Worker test',source_file_url='/uploads/input.pdf');db_session.add(book);await db_session.flush()
    job=GenerationJob(owner_id=user.id,audiobook_id=book.id,total_pages=2);db_session.add(job);db_session.add(Setting(key='policy',value=DEFAULTS));await db_session.commit()
    buffer=BytesIO()
    with wave.open(buffer,'wb') as wav:
        wav.setnchannels(1);wav.setsampwidth(2);wav.setframerate(8000);wav.writeframes(b'\x00\x00'*800)
    calls=0
    class FakeTTS:
        def __init__(self,**kwargs):pass
        async def __aenter__(self):return self
        async def __aexit__(self,*args):pass
        async def post(self,url,**kwargs):
            nonlocal calls
            request=httpx.Request('POST',url)
            if url==settings.TTS_EXTRACT_URL:return httpx.Response(200,json={'text':'Test page narration'},request=request)
            calls+=1
            if calls==2:return httpx.Response(503,request=request)
            return httpx.Response(200,content=buffer.getvalue(),request=request)
    monkeypatch.setattr(worker.httpx,'AsyncClient',FakeTTS)
    lease=await claim(db_session);assert lease
    await worker.process(*lease)
    await db_session.refresh(job)
    assert job.completed_pages==1 and job.status==AudiobookStatus.PENDING
    chapters=(await db_session.scalars(select(Chapter).where(Chapter.audiobook_id==book.id))).all()
    assert [c.chapter_number for c in chapters]==[1]
    job.available_at=datetime.now(timezone.utc)-timedelta(seconds=1);await db_session.commit()
    lease=await claim(db_session);assert lease
    await worker.process(*lease)
    await db_session.refresh(job)
    assert job.status==AudiobookStatus.COMPLETED and job.completed_pages==2
    chapters=(await db_session.scalars(select(Chapter).where(Chapter.audiobook_id==book.id).order_by(Chapter.chapter_number).execution_options(populate_existing=True))).all()
    # No chapter titles: page 2 continues page 1's chapter in one continuous file.
    assert [c.chapter_number for c in chapters]==[1] and chapters[0].title=='Worker test'
    assert abs(chapters[0].duration_seconds-0.2)<1e-6
    assert calls==3  # First page was not regenerated after recovery.


def test_pages_split_into_chapters_at_titles():
    text = "end of the last chapter.\n## অধ্যায় ২\nনতুন অধ্যায়ের লেখা।"
    assert worker.split_chapters(text) == [
        (None, "end of the last chapter."),
        ("অধ্যায় ২", "অধ্যায় ২।\nনতুন অধ্যায়ের লেখা।"),
    ]
    assert worker.split_chapters("   \n") == []
    assert worker.split_chapters("## Chapter 3") == [("Chapter 3", "Chapter 3।")]
