"""Database queue: aging, FIFO ties, one live lease per account, fenced recovery."""
from datetime import datetime, timezone, timedelta
import uuid
from sqlalchemy import select, or_
from app.models import GenerationJob, AudiobookStatus, User
from app.models.platform import Setting
from app.services.policy import configuration, utc

def priority_key(job, now, aging_seconds):
    score = job.priority + int((now - utc(job.created_at)).total_seconds() // aging_seconds)
    return (-score, utc(job.created_at), str(job.id))

async def claim(db):
    # One short scheduler transaction serializes account lease decisions, not execution.
    lock = await db.scalar(select(Setting).where(Setting.key == "policy").with_for_update())
    if not lock:
        raise RuntimeError("Run database migrations before starting the worker")
    policy = await configuration(db)
    now = datetime.now(timezone.utc)
    expired = (await db.scalars(select(GenerationJob).where(GenerationJob.status == AudiobookStatus.PROCESSING,
        GenerationJob.lease_until < now).with_for_update())).all()
    for job in expired:
        job.status = AudiobookStatus.FAILED if job.attempts >= policy["max_attempts"] else AudiobookStatus.PENDING
        job.error_message = "Worker lease expired"
        job.lease_token = None
        from app.models import Audiobook
        book = await db.get(Audiobook, job.audiobook_id)
        book.status = job.status
        if job.status == AudiobookStatus.FAILED:
            from app.services.notification_service import notify
            notify(db, job.owner_id, "generation.failed", "অডিওবুক তৈরি ব্যর্থ",
                   f"«{book.title}» তৈরি করা যায়নি। আবার চেষ্টা করুন।",
                   en=("Audiobook generation failed", f"“{book.title}” could not be generated. Please try again."),
                   audiobook_id=book.id, job_id=job.id)
    await db.flush()
    busy = set((await db.scalars(select(GenerationJob.owner_id).where(
        GenerationJob.status == AudiobookStatus.PROCESSING, GenerationJob.cancelled.is_(False)))).all())
    jobs = (await db.scalars(select(GenerationJob).join(User, User.id == GenerationJob.owner_id).where(
        GenerationJob.status == AudiobookStatus.PENDING, GenerationJob.cancelled.is_(False),
        User.suspended.is_(False),
        or_(GenerationJob.available_at.is_(None), GenerationJob.available_at <= now)))).all()
    candidates = [j for j in jobs if j.owner_id not in busy]
    # A busy account cannot take consecutive turns while another account is waiting.
    last_owner = await db.scalar(select(GenerationJob.owner_id).where(GenerationJob.started_at.is_not(None))
        .order_by(GenerationJob.started_at.desc(), GenerationJob.id).limit(1))
    alternatives = [j for j in candidates if j.owner_id != last_owner]
    if alternatives:
        candidates = alternatives
    if not candidates:
        await db.commit()
        return None
    job = min(candidates, key=lambda j: priority_key(j, now, policy["aging_seconds"]))
    job.status = AudiobookStatus.PROCESSING
    job.attempts += 1
    job.started_at = now
    job.lease_token = uuid.uuid4().hex
    job.lease_until = now + timedelta(seconds=policy["lease_seconds"])
    await db.commit()
    return job.id, job.lease_token
