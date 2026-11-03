"""
Authentication Pydantic schemas.
"""

from typing import Optional

from pydantic import BaseModel, Field, field_validator
from app.schemas.user import UserRead


def check_password(value: str) -> str:
    """At least 8 characters, at most 72 UTF-8 bytes, with a letter and a number."""
    import re
    if len(value) < 8:
        raise ValueError("Password must be at least 8 characters")
    if len(value.encode("utf-8")) > 72:
        raise ValueError("Password must be at most 72 UTF-8 bytes")
    if not re.search(r"[A-Za-z]", value) or not re.search(r"\d", value):
        raise ValueError("Password must contain a letter and a number")
    return value


class RegisterRequest(BaseModel):
    full_name: str = Field(default="", max_length=150)
    username: str = Field(min_length=3, max_length=50, description="Unique username")
    email: str = Field(min_length=5, max_length=255, description="Unique user email address")
    password: str = Field(min_length=8, max_length=128, description="At least 8 characters with a letter and a number")
    # The 6-digit code from POST /auth/register/start (when verification is required).
    email_code: Optional[str] = Field(default=None, pattern=r"^\d{6}$")

    @field_validator("password")
    @classmethod
    def password_rules(cls, value):
        return check_password(value)

    @field_validator("email")
    @classmethod
    def email_format(cls, value):
        import re
        value = value.strip().lower()
        if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", value):
            raise ValueError("Invalid email address")
        return value

    @field_validator("username")
    @classmethod
    def username_format(cls, value):
        import re
        if not re.fullmatch(r"[A-Za-z0-9_]{3,50}", value.strip()):
            raise ValueError("Username must contain letters, numbers or underscores")
        return value.strip()


class LoginRequest(BaseModel):
    username_or_email: str = Field(description="Username or email address")
    password: str = Field(description="Account password")


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserRead
