"""
Audiobook router: discovery, creation, updates, visibility, PDF upload,
generation job submission, status queries, and chapter access.
"""

from typing import Literal, Optional
import uuid
from fastapi import APIRouter, File, Query, UploadFile, status

from app.api.deps import CurrentUserDep, DatabaseDep, OptionalUserDep
from app.models.audiobook import AudiobookStatus
from app.schemas.audiobook import (
    AudiobookCreate,
    AudiobookListResponse,
    AudiobookRead,
    AudiobookUpdate,
    AudiobookVisibilityUpdate,
)
from app.schemas.chapter import ChapterRead
from app.schemas.generation import (
    AudiobookGenerationStatusResponse,
    GenerationCallbackRequest,
    GenerationJobRead,
    GenerationJobResponse,
)
from app.services import audiobook_service, chapter_service, generation_service
from app.services.storage_service import get_storage_service

router = APIRouter()


# ── Public Discovery ──────────────────────────────────────────────────────────

@router.get(
    "",
    response_model=AudiobookListResponse,
    summary="Discover public audiobooks",
)
async def discover_audiobooks(
    db: DatabaseDep,
    page: int = Query(default=1, ge=1, description="Page number"),
    size: int = Query(default=20, ge=1, le=100, description="Items per page"),
    language: Optional[str] = Query(default=None, description="Filter by language code"),
    author: Optional[str] = Query(default=None, description="Search by author name"),
    status: Optional[AudiobookStatus] = Query(default=None, description="Filter status (COMPLETED only in public)"),
    q: str | None = None,
    genre: str | None = None,
    publisher: uuid.UUID | None = None,
    channel: uuid.UUID | None = None,
    access_tier: str | None = None,
    sort: Literal["newest", "oldest", "title", "shortest", "longest"] = "newest",
) -> AudiobookListResponse:
    """
    Public audiobook discovery endpoint.
    Strictly returns only PUBLIC audiobooks with status COMPLETED.
    PRIVATE audiobooks never appear in this response.
    """
    items, total, pages = await audiobook_service.get_public_audiobooks(
        db=db,
        page=page,
        size=size,
        language=language,
        author=author,
        status_filter=status,
        q=q, genre=genre, publisher=publisher, channel=channel, access_tier=access_tier, sort=sort,
    )
    return AudiobookListResponse(
        items=[AudiobookRead.model_validate(item) for item in items],
        total=total,
        page=page,
        size=size,
        pages=pages,
    )


# ── User's Own Audiobooks ─────────────────────────────────────────────────────

@router.get(
    "/my",
    response_model=AudiobookListResponse,
    summary="List all audiobooks owned by current user",
)
async def list_my_audiobooks(
    db: DatabaseDep,
    current_user: CurrentUserDep,
    page: int = Query(default=1, ge=1),
    size: int = Query(default=20, ge=1, le=100),
) -> AudiobookListResponse:
    """Retrieve all audiobooks created by the authenticated user (both public and private)."""
    items, total, pages = await audiobook_service.get_user_audiobooks(
        db=db,
        user=current_user,
        page=page,
        size=size,
    )
    return AudiobookListResponse(
        items=[AudiobookRead.model_validate(item) for item in items],
        total=total,
        page=page,
        size=size,
        pages=pages,
    )


# ── Create Audiobook ──────────────────────────────────────────────────────────

@router.post(
    "",
    response_model=AudiobookRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new audiobook",
)
async def create_audiobook(
    data: AudiobookCreate,
    db: DatabaseDep,
    current_user: CurrentUserDep,
) -> AudiobookRead:
    """Create a new audiobook metadata container owned by the authenticated user."""
    audiobook = await audiobook_service.create_audiobook(
        db=db,
        user=current_user,
        data=data,
    )
    return AudiobookRead.model_validate(audiobook)


# ── Audiobook Details ─────────────────────────────────────────────────────────

@router.get(
    "/{id}",
    response_model=AudiobookRead,
    summary="Get audiobook details",
)
async def get_audiobook(
    id: uuid.UUID,
    db: DatabaseDep,
    current_user: OptionalUserDep,
) -> AudiobookRead:
    """
    Retrieve audiobook details applying authorization rules:
    - Owner: Full access regardless of visibility or status.
    - Other users: Accessible only if visibility is PUBLIC and status is COMPLETED.
    - Otherwise returns 404 without leaking resource existence.
    """
    audiobook = await audiobook_service.get_audiobook_for_user(
        db=db,
        audiobook_id=id,
        user=current_user,
    )
    return AudiobookRead.model_validate(audiobook)


# ── Update Audiobook Metadata ─────────────────────────────────────────────────

@router.patch(
    "/{id}",
    response_model=AudiobookRead,
    summary="Update audiobook metadata (Owner only)",
)
async def update_audiobook(
    id: uuid.UUID,
    data: AudiobookUpdate,
    db: DatabaseDep,
    current_user: CurrentUserDep,
) -> AudiobookRead:
    """Update title, author, description, or language. Only the owner can perform this."""
    audiobook = await audiobook_service.update_audiobook(
        db=db,
        audiobook_id=id,
        user=current_user,
        data=data,
    )
    return AudiobookRead.model_validate(audiobook)


# ── Delete Audiobook ──────────────────────────────────────────────────────────

@router.delete(
    "/{id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete audiobook (Owner only)",
)
async def delete_audiobook(
    id: uuid.UUID,
    db: DatabaseDep,
    current_user: CurrentUserDep,
):
    """Delete an audiobook and all its associated chapters and jobs. Owner only."""
    await audiobook_service.delete_audiobook(
        db=db,
        audiobook_id=id,
        user=current_user,
    )
    return None


# ── Visibility Management ─────────────────────────────────────────────────────

@router.patch(
    "/{id}/visibility",
    response_model=AudiobookRead,
    summary="Change audiobook visibility: PUBLIC or PRIVATE (Owner only)",
)
async def change_visibility(
    id: uuid.UUID,
    data: AudiobookVisibilityUpdate,
    db: DatabaseDep,
    current_user: CurrentUserDep,
) -> AudiobookRead:
    """
    Change audiobook visibility between PUBLIC and PRIVATE.
    Only the owner is permitted to perform this change.
    """
    audiobook = await audiobook_service.update_visibility(
        db=db,
        audiobook_id=id,
        user=current_user,
        new_visibility=data.visibility,
    )
    return AudiobookRead.model_validate(audiobook)


# ── PDF Source Document Upload ────────────────────────────────────────────────

@router.post(
    "/{id}/source",
    response_model=AudiobookRead,
    summary="Upload PDF source document (Owner only)",
)
async def upload_source_pdf(
    id: uuid.UUID,
    db: DatabaseDep,
    current_user: CurrentUserDep,
    file: UploadFile = File(..., description="PDF source document for the audiobook"),
) -> AudiobookRead:
    """
    Upload a source PDF document for the audiobook.
    Validates ownership, file type (.pdf), and file size.
    Stores the document using the storage abstraction and records its URL.
    """
    # Verify ownership before storing file
    from sqlalchemy import select
    from app.models import User, GenerationJob
    from fastapi import HTTPException
    await db.execute(select(User).where(User.id == current_user.id).with_for_update())
    audiobook = await audiobook_service.get_audiobook_raw(db, id)
    if not audiobook:
        from fastapi import HTTPException
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Audiobook not found",
        )
    if audiobook.owner_id != current_user.id:
        from fastapi import HTTPException
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the audiobook owner can upload the source document",
        )

    active_job = await db.scalar(select(GenerationJob.id).where(GenerationJob.audiobook_id == id,
        GenerationJob.status.in_([AudiobookStatus.PENDING, AudiobookStatus.PROCESSING]), GenerationJob.cancelled.is_(False)))
    if active_job or audiobook.status == AudiobookStatus.COMPLETED:
        raise HTTPException(409, "Create a new version instead of replacing an active or completed source")
    # Save file via storage abstraction
    storage = get_storage_service()
    source_url = await storage.save_upload_file(file=file, subfolder="sources")

    # Update audiobook record
    audiobook.source_file_url = source_url
    await db.commit()
    await db.refresh(audiobook)

    return AudiobookRead.model_validate(audiobook)


# ── Cover Image Upload ────────────────────────────────────────────────────────

@router.post(
    "/{id}/cover",
    response_model=AudiobookRead,
    summary="Upload a cover image (Owner only)",
)
async def upload_cover(
    id: uuid.UUID,
    db: DatabaseDep,
    current_user: CurrentUserDep,
    file: UploadFile = File(..., description="JPEG, PNG or WebP cover image (max 5MB)"),
) -> AudiobookRead:
    """Replace the audiobook cover. Covers are public catalog artwork, not protected media."""
    from fastapi import HTTPException
    audiobook = await audiobook_service.get_audiobook_raw(db, id)
    if not audiobook or audiobook.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Audiobook not found")
    name = await get_storage_service().save_cover_image(file)
    audiobook.cover_image_url = f"/api/v1/covers/{name}"
    await db.commit()
    await db.refresh(audiobook)
    return AudiobookRead.model_validate(audiobook)


# ── Generation Job Trigger & Status ───────────────────────────────────────────

@router.post(
    "/{id}/generate",
    response_model=GenerationJobResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Request audiobook generation (Owner only)",
)
async def trigger_generation(
    id: uuid.UUID,
    db: DatabaseDep,
    current_user: CurrentUserDep,
) -> GenerationJobResponse:
    """
    Request audiobook generation by the AI Model Runner.
    Verifies ownership and validates that a PDF source document is uploaded.
    Dispatches a generation job asynchronously and returns immediately.
    """
    job = await generation_service.request_audiobook_generation(
        db=db,
        audiobook_id=id,
        user=current_user,
    )
    return GenerationJobResponse(
        job_id=job.id,
        status=job.status,
        message="Generation job submitted to Model Runner queue",
    )


@router.get(
    "/{id}/generation-status",
    response_model=AudiobookGenerationStatusResponse,
    summary="Get generation job status (Owner only)",
)
async def get_generation_status(
    id: uuid.UUID,
    db: DatabaseDep,
    current_user: CurrentUserDep,
) -> AudiobookGenerationStatusResponse:
    """Retrieve current generation status and job history for an audiobook."""
    audiobook, latest_job, history = await generation_service.get_audiobook_generation_status(
        db=db,
        audiobook_id=id,
        user=current_user,
    )
    return AudiobookGenerationStatusResponse(
        audiobook_id=audiobook.id,
        audiobook_status=audiobook.status,
        latest_job=GenerationJobRead.model_validate(latest_job) if latest_job else None,
        history=[GenerationJobRead.model_validate(j) for j in history],
    )


# ── Chapters Access ───────────────────────────────────────────────────────────

@router.get(
    "/{id}/chapters",
    response_model=list[ChapterRead],
    summary="List chapters of an audiobook",
)
async def get_audiobook_chapters(
    id: uuid.UUID,
    db: DatabaseDep,
    current_user: OptionalUserDep,
) -> list[ChapterRead]:
    """
    Retrieve all chapters for an audiobook.
    Applies the same visibility and authorization rules as the audiobook.
    """
    chapters = await chapter_service.get_chapters_for_user(
        db=db,
        audiobook_id=id,
        user=current_user,
    )
    return [ChapterRead.model_validate(c) for c in chapters]


@router.get(
    "/{id}/chapters/{chapter_id}",
    response_model=ChapterRead,
    summary="Get a specific chapter of an audiobook",
)
async def get_audiobook_chapter(
    id: uuid.UUID,
    chapter_id: uuid.UUID,
    db: DatabaseDep,
    current_user: OptionalUserDep,
) -> ChapterRead:
    """
    Retrieve details of a specific chapter.
    Applies the same visibility and authorization rules as the audiobook.
    """
    chapter = await chapter_service.get_chapter_for_user(
        db=db,
        audiobook_id=id,
        chapter_id=chapter_id,
        user=current_user,
    )
    return ChapterRead.model_validate(chapter)


# ── Generation Webhook Callback ───────────────────────────────────────────────

@router.post(
    "/generation-callback",
    summary="Webhook callback from TTS Service upon job completion",
    status_code=status.HTTP_200_OK,
)
async def generation_callback(
    data: GenerationCallbackRequest,
    db: DatabaseDep,
):
    """
    Webhook endpoint invoked by the AI TTS Service when a generation job finishes.
    Updates Audiobook and GenerationJob statuses, and creates the single main audio chapter.
    """
    from fastapi import HTTPException
    raise HTTPException(410, "Legacy callbacks are disabled; use the durable generation worker")
