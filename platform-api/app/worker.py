"""Run separately with `python -m app.worker`; API requests never execute OCR/TTS."""
import asyncio
import io
import logging
import wave
from pathlib import Path
from datetime import datetime, timezone, timedelta
import httpx
from pypdf import PdfReader, PdfWriter
from sqlalchemy import select
from app.core.config import settings
from app.core.database import async_session_maker
from app.models import GenerationJob, Audiobook, AudiobookStatus, Chapter, User
from app.services.scheduler import claim
from app.services.notification_service import deliver, notify
from app.services.policy import configuration
from app.services.storage_service import get_storage_service

log = logging.getLogger("generation-worker")

async def fenced(db, id, token):
    job = await db.scalar(select(GenerationJob).where(GenerationJob.id == id).with_for_update())
    if not job or job.lease_token != token or job.cancelled or job.status != AudiobookStatus.PROCESSING:
        raise asyncio.CancelledError()
    owner = await db.get(User, job.owner_id)
    if owner.suspended:
        raise RuntimeError("Account no longer authorized for generation")
    return job

async def renew(id, token):
    while True:
        await asyncio.sleep(20)
        async with async_session_maker() as db:
            job = await fenced(db, id, token)
            policy = await configuration(db)
            job.lease_until = datetime.now(timezone.utc) + timedelta(seconds=policy["lease_seconds"])
            await db.commit()

async def process(id, token):
    heartbeat = asyncio.create_task(renew(id, token))
    pending = None
    try:
        async with async_session_maker() as db:
            job = await fenced(db, id, token)
            book = await db.get(Audiobook, job.audiobook_id)
            book.status = AudiobookStatus.PROCESSING
            book_id, language, completed = book.id, book.language, job.completed_pages
            path = await get_storage_service().get_file_path(book.source_file_url)
            await db.commit()
        reader = await asyncio.to_thread(PdfReader, path)
        async with httpx.AsyncClient(timeout=600, headers={"X-Service-Key": settings.TTS_SERVICE_KEY}) as client:
            async def extract(index):
                writer = PdfWriter()
                writer.add_page(reader.pages[index])
                buffer = io.BytesIO()
                writer.write(buffer)
                response = await client.post(settings.TTS_EXTRACT_URL, files={"file": ("page.pdf", buffer.getvalue(), "application/pdf")}, data={"language": language})
                response.raise_for_status()
                return response.json()["text"]
            if completed < len(reader.pages):
                pending = asyncio.create_task(extract(completed))
            for index in range(completed, len(reader.pages)):
                text = await pending
                pending = asyncio.create_task(extract(index + 1)) if index + 1 < len(reader.pages) else None
                audio_key, duration = None, 0
                if text.strip():
                    response = await client.post(settings.TTS_GENERATE_URL, json={"text": text, "language": language})
                    response.raise_for_status()
                    with wave.open(io.BytesIO(response.content), "rb") as audio:
                        duration = audio.getnframes() / audio.getframerate()
                    folder = Path(settings.UPLOAD_DIR) / "audio"
                    folder.mkdir(parents=True, exist_ok=True)
                    output = folder / f"{id}-{token}-{index+1}.wav"
                    await asyncio.to_thread(output.write_bytes, response.content)
                    audio_key = f"/uploads/audio/{output.name}"
                    await get_storage_service().persist(audio_key)
                async with async_session_maker() as db:
                    job = await fenced(db, id, token)
                    # A page is committed atomically with its ordered audio chunk.
                    chapter = await db.scalar(select(Chapter).where(Chapter.audiobook_id == book_id, Chapter.chapter_number == index + 1))
                    if audio_key:
                        if not chapter:
                            chapter = Chapter(audiobook_id=book_id, title=f"Page {index+1}", chapter_number=index+1)
                            db.add(chapter)
                        chapter.audio_url, chapter.duration_seconds = audio_key, duration
                    job.completed_pages = index + 1
                    await db.commit()
            async with async_session_maker() as db:
                job = await fenced(db, id, token)
                book = await db.get(Audiobook, book_id)
                chapters = (await db.scalars(select(Chapter).where(Chapter.audiobook_id == book_id).order_by(Chapter.chapter_number))).all()
                if not chapters:
                    raise ValueError("No readable text was found in this PDF")
                book.duration_seconds = sum(c.duration_seconds for c in chapters)
                book.audio_url = None  # A multi-page book is played through its ordered chapters.
                book.status = job.status = AudiobookStatus.COMPLETED
                job.completed_at = datetime.now(timezone.utc)
                job.lease_token = None
                notice = notify(db, job.owner_id, "generation.completed",
                                "অডিওবুক প্রস্তুত 🎧", f"«{book.title}» শোনার জন্য প্রস্তুত।",
                                audiobook_id=book.id, job_id=job.id)
                await db.commit()
                await deliver(db, [notice])
    except asyncio.CancelledError:
        log.info("Generation cancelled or lease lost: %s", id)
    except Exception:
        log.exception("Generation failed: %s", id)
        async with async_session_maker() as db:
            job = await db.scalar(select(GenerationJob).where(GenerationJob.id == id).with_for_update())
            if job and job.lease_token == token and not job.cancelled:
                policy = await configuration(db)
                job.status = AudiobookStatus.PENDING if job.attempts < policy["max_attempts"] else AudiobookStatus.FAILED
                job.error_message = "Processing failed. See worker logs for details."
                job.available_at = datetime.now(timezone.utc) + timedelta(seconds=30 * 2 ** job.attempts)
                job.lease_token = None
                book = await db.get(Audiobook, job.audiobook_id)
                book.status = job.status
                notice = None
                if job.status == AudiobookStatus.FAILED:
                    notice = notify(db, job.owner_id, "generation.failed",
                                    "অডিওবুক তৈরি ব্যর্থ", f"«{book.title}» তৈরি করা যায়নি। আবার চেষ্টা করুন।",
                                    audiobook_id=book.id, job_id=job.id)
                await db.commit()
                await deliver(db, [notice])
    finally:
        heartbeat.cancel()
        if pending:
            pending.cancel()
        await asyncio.gather(heartbeat, *([pending] if pending else []), return_exceptions=True)

async def main():
    if not settings.TTS_SERVICE_KEY:
        raise RuntimeError("TTS_SERVICE_KEY is required")
    while True:
        async with async_session_maker() as db:
            lease = await claim(db)
        if lease:
            await process(*lease)
        else:
            await asyncio.sleep(2)

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(main())
