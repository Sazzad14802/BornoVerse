"""
User Pydantic schemas.
"""

from datetime import datetime
import uuid
from pydantic import BaseModel, ConfigDict, Field


class UserBase(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    email: str = Field(min_length=5, max_length=255)


class UserRead(UserBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    serial: int | None = None
    created_at: datetime
    updated_at: datetime
    account_type: str
    publisher_status: str
    suspended: bool
    full_name: str | None = None
    premium_until: datetime | None = None
    subscription_cancelled: bool = False
