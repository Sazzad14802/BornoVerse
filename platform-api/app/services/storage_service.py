"""
Storage service abstraction for saving and retrieving uploaded source documents.
Implements LocalStorageService; designed to easily swap with S3/R2/MinIO.
"""

from abc import ABC, abstractmethod
import os
from pathlib import Path
import shutil
from typing import Optional
import uuid
from fastapi import HTTPException, UploadFile, status

from app.core.config import settings


COVER_MAX_BYTES = 5 * 1024 * 1024


def image_extension(data: bytes) -> Optional[str]:
    """Identify an image by its magic bytes rather than trusting the client filename."""
    if data.startswith(b"\xff\xd8\xff"):
        return ".jpg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return ".png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return ".webp"
    return None


class BaseStorageService(ABC):
    """Abstract interface for file storage backends."""

    @abstractmethod
    async def save_upload_file(
        self,
        file: UploadFile,
        subfolder: str = "sources",
    ) -> str:
        """Save an uploaded file and return its accessible URL / storage key."""
        pass

    @abstractmethod
    async def save_cover_image(self, file: UploadFile) -> str:
        """Save a validated cover image and return its public file name."""
        pass

    @abstractmethod
    async def get_file_path(self, file_url_or_key: str) -> Optional[str]:
        """Resolve a storage URL/key to a local filesystem path if available."""
        pass

    @abstractmethod
    async def delete_file(self, file_url_or_key: str) -> bool:
        """Delete a stored file by URL/key."""
        pass

    async def persist(self, file_url_or_key: str) -> None:
        """Make a file written directly beneath UPLOAD_DIR durable (no-op on local disk)."""


class LocalStorageService(BaseStorageService):
    """Local filesystem storage implementation."""

    def __init__(self, base_dir: Optional[str] = None):
        self.base_dir = Path(base_dir or settings.UPLOAD_DIR)
        self.base_dir.mkdir(parents=True, exist_ok=True)

    async def save_upload_file(
        self,
        file: UploadFile,
        subfolder: str = "sources",
    ) -> str:
        # Validate file type: must be PDF
        filename = file.filename or "document.pdf"
        extension = Path(filename).suffix.lower()
        if extension != ".pdf":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid file type: expected a .pdf file, got '{extension or 'unknown'}'",
            )

        target_dir = self.base_dir / subfolder
        target_dir.mkdir(parents=True, exist_ok=True)

        # Unique filename to avoid collisions
        unique_filename = f"{uuid.uuid4()}.pdf"
        destination_path = target_dir / unique_filename

        max_size_bytes = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
        total_size = 0
        header = await file.read(5)
        await file.seek(0)
        if header != b"%PDF-":
            raise HTTPException(400, "File is not a PDF document")

        # Stream file to disk while checking size limit
        try:
            with open(destination_path, "wb") as out_file:
                while chunk := await file.read(1024 * 64):  # 64KB chunks
                    total_size += len(chunk)
                    if total_size > max_size_bytes:
                        out_file.close()
                        if destination_path.exists():
                            destination_path.unlink()
                        raise HTTPException(
                            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                            detail=f"File exceeds maximum allowed size of {settings.MAX_UPLOAD_SIZE_MB}MB",
                        )
                    out_file.write(chunk)
        except HTTPException:
            raise
        except Exception as e:
            if destination_path.exists():
                destination_path.unlink()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to save file: {str(e)}",
            )

        try:
            from pypdf import PdfReader
            reader = PdfReader(destination_path)
            if reader.is_encrypted or not 0 < len(reader.pages) <= 1000:
                raise ValueError("Unsupported document")
        except Exception:
            destination_path.unlink(missing_ok=True)
            raise HTTPException(400, "PDF must be readable, unencrypted, and contain 1–1000 pages")

        # Return standardized URL/path reference
        relative_path = f"/uploads/{subfolder}/{unique_filename}"
        return relative_path

    async def save_cover_image(self, file: UploadFile) -> str:
        """Store a JPEG/PNG/WebP cover (validated by signature, max 5 MB) and return its file name."""
        data = await file.read(COVER_MAX_BYTES + 1)
        if len(data) > COVER_MAX_BYTES:
            raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "Cover image exceeds 5MB")
        extension = image_extension(data)
        if not extension:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cover must be a JPEG, PNG or WebP image")
        target_dir = self.base_dir / "covers"
        target_dir.mkdir(parents=True, exist_ok=True)
        name = f"{uuid.uuid4()}{extension}"
        (target_dir / name).write_bytes(data)
        return name

    async def get_file_path(self, file_url_or_key: str) -> Optional[str]:
        clean_key = file_url_or_key.lstrip("/")
        if clean_key.startswith("uploads/"):
            clean_key = clean_key[len("uploads/"):]
        file_path = (self.base_dir / clean_key).resolve()
        if not file_path.is_relative_to(self.base_dir.resolve()):
            return None
        if file_path.exists():
            return str(file_path.resolve())
        return None

    async def delete_file(self, file_url_or_key: str) -> bool:
        path_str = await self.get_file_path(file_url_or_key)
        if path_str and os.path.exists(path_str):
            try:
                os.remove(path_str)
                return True
            except OSError:
                return False
        return False


class SupabaseStorageService(LocalStorageService):
    """
    Local disk as a cache, mirrored to a private Supabase Storage bucket.

    Keys stay "/uploads/<folder>/<name>"; the object path is "<folder>/<name>".
    A file missing from disk (after a restart) is downloaded again on first use.
    """

    def __init__(self, base_dir: Optional[str] = None):
        super().__init__(base_dir)
        self.endpoint = f"{settings.SUPABASE_URL.rstrip('/')}/storage/v1/object/{settings.SUPABASE_STORAGE_BUCKET}"
        key = settings.SUPABASE_SERVICE_ROLE_KEY
        self.headers = {"apikey": key, "Authorization": f"Bearer {key}"}

    @staticmethod
    def object_path(file_url_or_key: str) -> str:
        return file_url_or_key.lstrip("/").removeprefix("uploads/")

    def local_path(self, file_url_or_key: str) -> Optional[Path]:
        path = (self.base_dir / self.object_path(file_url_or_key)).resolve()
        return path if path.is_relative_to(self.base_dir.resolve()) else None

    async def persist(self, file_url_or_key: str) -> None:
        import httpx
        path = self.local_path(file_url_or_key)
        if not path or not path.exists():
            return
        async with httpx.AsyncClient(timeout=300) as client:
            response = await client.post(
                f"{self.endpoint}/{self.object_path(file_url_or_key)}",
                content=path.read_bytes(),
                headers={**self.headers, "x-upsert": "true", "Content-Type": "application/octet-stream"},
            )
        if response.status_code >= 300:
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Cloud storage upload failed: {response.text[:200]}")

    async def save_upload_file(self, file: UploadFile, subfolder: str = "sources") -> str:
        key = await super().save_upload_file(file, subfolder)
        await self.persist(key)
        return key

    async def save_cover_image(self, file: UploadFile) -> str:
        name = await super().save_cover_image(file)
        await self.persist(f"/uploads/covers/{name}")
        return name

    async def get_file_path(self, file_url_or_key: str) -> Optional[str]:
        import httpx
        cached = await super().get_file_path(file_url_or_key)
        path = self.local_path(file_url_or_key)
        if cached or not path:
            return cached
        async with httpx.AsyncClient(timeout=300) as client:
            response = await client.get(f"{self.endpoint}/{self.object_path(file_url_or_key)}", headers=self.headers)
        if response.status_code != 200:
            return None
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(response.content)
        return str(path)

    async def delete_file(self, file_url_or_key: str) -> bool:
        import httpx
        removed = await super().delete_file(file_url_or_key)
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.delete(f"{self.endpoint}/{self.object_path(file_url_or_key)}", headers=self.headers)
        return removed or response.status_code < 300


def get_storage_service() -> BaseStorageService:
    """Storage service provider."""
    if settings.STORAGE_TYPE == "supabase":
        return SupabaseStorageService()
    return LocalStorageService()
