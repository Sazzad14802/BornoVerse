"""
API v1 main router.
Aggregates all feature endpoints under /api/v1.
"""

from fastapi import APIRouter

from app.api.v1.endpoints import (
    audiobooks,
    auth,
    library,
    playback,
    users,
)

api_router = APIRouter()
from app.api.v1.endpoints import management, accounts
from app.api.v1.endpoints import media
from app.api.v1.endpoints import identity
from app.api.v1.endpoints import notifications
from app.api.v1.endpoints import payments
from app.api.v1.endpoints import social
from app.api.v1.endpoints import moderation
api_router.include_router(identity.router, prefix="/auth", tags=["identity"])
api_router.include_router(payments.router, tags=["payments"])
api_router.include_router(notifications.router, prefix="/notifications", tags=["notifications"])
api_router.include_router(media.router, tags=["media"])
api_router.include_router(moderation.admin_router, prefix="/admin", tags=["moderation"])
api_router.include_router(management.router, prefix="/admin", tags=["admin"])
api_router.include_router(moderation.router, tags=["moderation"])
api_router.include_router(accounts.router, tags=["accounts"])
api_router.include_router(social.router, tags=["social"])

api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(audiobooks.router, prefix="/audiobooks", tags=["audiobooks"])
api_router.include_router(library.router, prefix="/library", tags=["library"])
api_router.include_router(playback.router, prefix="/playback", tags=["playback"])
