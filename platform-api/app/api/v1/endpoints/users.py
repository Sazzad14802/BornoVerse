"""
Users router: profile endpoints.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.api.deps import CurrentUserDep, DatabaseDep
from app.schemas.user import UserRead
from app.services.account_service import delete_account

router = APIRouter()


@router.get(
    "/me",
    response_model=UserRead,
    summary="Get user profile",
)
async def get_current_user_profile(
    current_user: CurrentUserDep,
) -> UserRead:
    """Retrieve profile of the currently authenticated user without sensitive data."""
    return UserRead.model_validate(current_user)


class DeleteAccountInput(BaseModel):
    confirm: str


@router.post("/me/delete", summary="Delete my account and everything in it")
async def delete_my_account(data: DeleteAccountInput, db: DatabaseDep, current_user: CurrentUserDep) -> dict:
    """Permanently removes the account: audiobooks and their audio, channel,
    playlists, library, history, follows, payments, reports and notifications.
    The caller types DELETE to confirm. Administrator accounts cannot be deleted here."""
    if data.confirm.strip() != "DELETE":
        raise HTTPException(422, "Type DELETE to confirm")
    if current_user.account_type != "user":
        raise HTTPException(403, "Administrator accounts cannot be deleted from the app")
    await delete_account(db, current_user)
    return {"deleted": True}
