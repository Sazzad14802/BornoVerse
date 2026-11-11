"""Run separately with `python -m app.worker`; API requests never execute OCR/TTS."""
import asyncio
import io
import logging
import re
import wave
from pathlib import Path
from datetime import datetime, timezone, timedelta
import httpx
from pypdf import PdfReader, PdfWriter
from sqlalchemy import func, select
from app.core.config import settings
from app.core.database import async_session_maker
from app.models import GenerationJob, Audiobook, AudiobookStatus, Chapter, User
from app.services.scheduler import claim
from app.services.notification_service import deliver, notify
from app.services.policy import configuration
from app.services.storage_service import get_storage_service
from app.services.social_service import announce

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

# 12 minutes of 24 kHz mono 16-bit WAV is about 35 MB: under Supabase's 50 MB upload
# limit, and small enough to join in memory on a 512 MB instance.
MAX_CHAPTER_SECONDS = 12 * 60


def failure_reason(exc: Exception) -> str:
    """A short, readable reason for the generation screen (no secrets, no stack)."""
    if isinstance(exc, httpx.HTTPStatusError):
        detail = ""
        try:
            detail = str(exc.response.json().get("detail", ""))[:160]
        except Exception:
            detail = exc.response.text[:160]
        where = "text reading (OCR)" if "extract" in str(exc.request.url) else "voice generation"
        return f"{where} failed (HTTP {exc.response.status_code}) {detail}".strip()
    if isinstance(exc, httpx.HTTPError):
        return f"Could not reach the voice service ({type(exc).__name__})"
    return f"{type(exc).__name__}: {str(exc)[:200]}"


class QuotaWait(Exception):
    """The TTS service has no quota left until `seconds` from now."""

    def __init__(self, seconds: int):
        super().__init__(f"TTS quota exhausted for {seconds}s")
        self.seconds = max(60, seconds)


HEADING = re.compile(r"^\s*#{1,3}\s+(.+?)\s*#*\s*$")


def split_chapters(text: str) -> list[tuple[str | None, str]]:
    """Split one OCR'd page into (chapter title, text to narrate) parts.

    The OCR marks chapter/section titles with '## '. Text before the first title
    continues the chapter of the previous page (title None); each title starts a
    new chapter, and the title itself is narrated at its start. A chapter can span
    many pages, and one page can hold the end of one chapter and the start of the next.
    """
    parts: list[tuple[str | None, list[str]]] = [(None, [])]
    for line in text.splitlines():
        match = HEADING.match(line)
        if match:
            title = match.group(1).strip().strip("*").strip()[:200]
            parts.append((title, [title + ("।" if title[-1:] not in "।.?!:" else "")]))
        else:
            parts[-1][1].append(line)
    result = []
    for title, lines in parts:
        body = "\n".join(lines).strip()
        if body:
            result.append((title, body))
    return result


def wav_frames(data: bytes) -> tuple[tuple, bytes]:
    with wave.open(io.BytesIO(data), "rb") as audio:
        return (audio.getnchannels(), audio.getsampwidth(), audio.getframerate()), audio.readframes(audio.getnframes())


def wav_bytes(params: tuple, frames: bytes) -> bytes:
    out = io.BytesIO()
    with wave.open(out, "wb") as audio:
        audio.setnchannels(params[0])
        audio.setsampwidth(params[1])
        audio.setframerate(params[2])
        audio.writeframes(frames)
    return out.getvalue()


async def append_page(id, token, book_id, book_title, index, parts):
    """Commit one page: each part is appended to the open chapter or starts a new one.

    A growing chapter gets a new file holding everything so far, so a listener
    already in it keeps playing and continues into the new audio. The book is
    playable from its first page on."""
    storage = get_storage_service()
    folder = Path(settings.UPLOAD_DIR) / "audio"
    folder.mkdir(parents=True, exist_ok=True)
    replaced, notice = [], None
    async with async_session_maker() as db:
        job = await fenced(db, id, token)
        chapters = (await db.scalars(select(Chapter).where(Chapter.audiobook_id == book_id)
                                     .order_by(Chapter.chapter_number))).all()
        current = chapters[-1] if chapters else None
        number = current.chapter_number if current else 0
        for position, (title, audio) in enumerate(parts):
            params, frames = wav_frames(audio)
            previous = None
            # A chapter's file is capped (storage upload limit, worker memory): past the
            # cap the chapter continues in a "(part 2)" chapter that plays straight after.
            too_long = bool(current and current.duration_seconds + len(frames) / (params[0] * params[1] * params[2])
                            > MAX_CHAPTER_SECONDS)
            if title is None and too_long:
                base = re.sub(r" \(part \d+\)$", "", current.title)
                part = int(m.group(1)) + 1 if (m := re.search(r"\(part (\d+)\)$", current.title)) else 2
                title = f"{base} (part {part})"
            if title is None and current and current.audio_url:
                path = await storage.get_file_path(current.audio_url)
                if path:
                    old_params, old_frames = wav_frames(await asyncio.to_thread(Path(path).read_bytes))
                    if old_params == params:
                        previous = old_frames
            if title is not None or current is None or previous is None and current.audio_url:
                number += 1
                fallback = book_title if number == 1 else f"Part {number}"
                current = Chapter(audiobook_id=book_id, title=(title or fallback)[:255], chapter_number=number)
                db.add(current)
            elif previous is not None:
                replaced.append(current.audio_url)
                frames = previous + frames
            output = folder / f"{id}-{token}-c{number}-p{index + 1}-{position}.wav"
            await asyncio.to_thread(output.write_bytes, wav_bytes(params, frames))
            key = f"/uploads/audio/{output.name}"
            await storage.persist(key)
            current.audio_url = key
            current.duration_seconds = len(frames) / (params[0] * params[1] * params[2])
        await db.flush()
        book = await db.get(Audiobook, book_id)
        total = await db.scalar(select(func.coalesce(func.sum(Chapter.duration_seconds), 0))
                                .where(Chapter.audiobook_id == book_id))
        first_audio = not book.duration_seconds
        book.duration_seconds = float(total or 0)
        book.audio_url = None  # played through its ordered chapters
        job.completed_pages = index + 1
        if first_audio and job.total_pages > index + 1:
            notice = notify(db, job.owner_id, "generation.first_ready", "শোনা শুরু করতে পারেন",
                            f"«{book.title}»-এর প্রথম অংশ প্রস্তুত। বাকিটা তৈরি হতে হতেই শোনা চালিয়ে যাবে।",
                            en=("Start listening now",
                                f"The first part of “{book.title}” is ready. The rest plays on as it is generated."),
                            audiobook_id=book.id, job_id=job.id)
        await db.commit()
        await deliver(db, [notice])
    # The superseded shorter versions are no longer referenced.
    for key in replaced:
        try:
            await storage.delete_file(key)
        except Exception:
            log.debug("Could not remove old chapter audio %s", key)


async def process(id, token):
    heartbeat = asyncio.create_task(renew(id, token))
    pending = None
    try:
        async with async_session_maker() as db:
            job = await fenced(db, id, token)
            book = await db.get(Audiobook, job.audiobook_id)
            book.status = AudiobookStatus.PROCESSING
            book_id, book_title, language, completed = book.id, book.title, book.language, job.completed_pages
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
            async def speak(text):
                response = await client.post(settings.TTS_GENERATE_URL, json={"text": text, "language": language})
                if response.status_code == 429:
                    try:
                        retry_after = int(response.json().get("retry_after") or 0)
                    except Exception:
                        retry_after = 0
                    raise QuotaWait(retry_after or int(response.headers.get("Retry-After", "3600")))
                response.raise_for_status()
                return response.content

            # The next page is read (OCR) while the current one is narrated.
            if completed < len(reader.pages):
                pending = asyncio.create_task(extract(completed))
            for index in range(completed, len(reader.pages)):
                text = await pending
                pending = asyncio.create_task(extract(index + 1)) if index + 1 < len(reader.pages) else None
                # Narrate every part of the page first, then commit the page in one step.
                parts = [(title, await speak(body)) for title, body in split_chapters(text)]
                if parts:
                    await append_page(id, token, book_id, book_title, index, parts)
                else:
                    async with async_session_maker() as db:
                        job = await fenced(db, id, token)
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
                                "অডিওবুক প্রস্তুত", f"«{book.title}» শোনার জন্য প্রস্তুত।",
                                en=("Audiobook ready", f"“{book.title}” is ready to listen."),
                                image=book.cover_image_url or "", audiobook_id=book.id, job_id=job.id)
                # A book created public in a channel goes live now: tell bell followers.
                await db.flush()
                followers = await announce(db, book)
                await db.commit()
                await deliver(db, [notice, *followers])
    except asyncio.CancelledError:
        log.info("Generation cancelled or lease lost: %s", id)
    except QuotaWait as wait:
        # Not a failure: every TTS key used its daily quota. Pause the job (pages done so
        # far stay done and playable) and pick it up again after the reset.
        log.warning("TTS quota used up; job %s resumes in %ss", id, wait.seconds)
        async with async_session_maker() as db:
            job = await db.scalar(select(GenerationJob).where(GenerationJob.id == id).with_for_update())
            if job and job.lease_token == token and not job.cancelled:
                job.status = AudiobookStatus.PENDING
                job.attempts = max(0, job.attempts - 1)  # this turn does not count as an attempt
                job.error_message = "Waiting for the daily voice quota to reset; generation continues automatically."
                job.available_at = datetime.now(timezone.utc) + timedelta(seconds=wait.seconds)
                job.lease_token = None
                book = await db.get(Audiobook, job.audiobook_id)
                book.status = AudiobookStatus.PROCESSING if job.completed_pages else AudiobookStatus.PENDING
                await db.commit()
    except Exception as exc:
        log.exception("Generation failed: %s", id)
        async with async_session_maker() as db:
            job = await db.scalar(select(GenerationJob).where(GenerationJob.id == id).with_for_update())
            if job and job.lease_token == token and not job.cancelled:
                policy = await configuration(db)
                job.status = AudiobookStatus.PENDING if job.attempts < policy["max_attempts"] else AudiobookStatus.FAILED
                # Shown on the generation screen, so the cause is visible without server logs.
                job.error_message = f"Page {job.completed_pages + 1}: {failure_reason(exc)}"[:500]
                job.available_at = datetime.now(timezone.utc) + timedelta(seconds=30 * 2 ** job.attempts)
                job.lease_token = None
                book = await db.get(Audiobook, job.audiobook_id)
                book.status = job.status
                notice = None
                if job.status == AudiobookStatus.FAILED:
                    notice = notify(db, job.owner_id, "generation.failed",
                                    "অডিওবুক তৈরি ব্যর্থ", f"«{book.title}» তৈরি করা যায়নি। আবার চেষ্টা করুন।",
                                    en=("Audiobook generation failed", f"“{book.title}” could not be generated. Please try again."),
                                    audiobook_id=book.id, job_id=job.id)
                await db.commit()
                await deliver(db, [notice])
    finally:
        heartbeat.cancel()
        if pending:
            pending.cancel()
        await asyncio.gather(heartbeat, *([pending] if pending else []), return_exceptions=True)

async def maintenance():
    """Every 15 minutes: close finished months (publisher earnings) and send Premium reminders."""
    from app.services import billing
    try:
        async with async_session_maker() as db:
            closed = await billing.close_due_months(db)
            if closed:
                log.info("Closed months: %s", ", ".join(closed))
        async with async_session_maker() as db:
            await billing.premium_reminders(db)
    except Exception:
        log.exception("Maintenance failed")


async def main():
    if not settings.TTS_SERVICE_KEY:
        raise RuntimeError("TTS_SERVICE_KEY is required")
    last_maintenance = 0.0
    while True:
        if asyncio.get_running_loop().time() - last_maintenance > 900:
            last_maintenance = asyncio.get_running_loop().time()
            await maintenance()
        async with async_session_maker() as db:
            lease = await claim(db)
        if lease:
            await process(*lease)
        else:
            await asyncio.sleep(2)

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(main())
