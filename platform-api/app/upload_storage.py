"""
Copy everything beneath UPLOAD_DIR into the Supabase Storage bucket, creating the
private bucket first if needed. Run once before switching a deployment to
STORAGE_TYPE=supabase:  python -m app.upload_storage
Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY; existing objects are overwritten.
"""
import asyncio
from pathlib import Path

import httpx

from app.core.config import settings
from app.services.storage_service import SupabaseStorageService


async def ensure_bucket(storage: SupabaseStorageService) -> None:
    async with httpx.AsyncClient(timeout=60) as client:
        response = await client.post(
            f"{settings.SUPABASE_URL.rstrip('/')}/storage/v1/bucket",
            json={"id": settings.SUPABASE_STORAGE_BUCKET, "name": settings.SUPABASE_STORAGE_BUCKET, "public": False},
            headers=storage.headers,
        )
    if response.status_code < 300:
        print(f"Created private bucket '{settings.SUPABASE_STORAGE_BUCKET}'")
    elif "already exists" not in response.text.lower() and response.status_code != 409:
        raise SystemExit(f"Could not create bucket: {response.status_code} {response.text[:200]}")


async def main() -> None:
    if not (settings.SUPABASE_URL and settings.SUPABASE_SERVICE_ROLE_KEY):
        raise SystemExit("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first")
    storage = SupabaseStorageService()
    await ensure_bucket(storage)
    root = Path(settings.UPLOAD_DIR)
    files = sorted(p for p in root.rglob("*") if p.is_file())
    for number, path in enumerate(files, 1):
        key = "/uploads/" + path.relative_to(root).as_posix()
        await storage.persist(key)
        print(f"[{number}/{len(files)}] {key}")
    print("Done")


if __name__ == "__main__":
    asyncio.run(main())
