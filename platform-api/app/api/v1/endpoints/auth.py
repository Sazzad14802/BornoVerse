"""
Authentication router: registration, login, and current authenticated identity.
"""

import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import delete, select

from app.api.deps import CurrentUserDep, DatabaseDep
from app.core.config import settings
from app.models import User
from app.models.platform import EmailVerification
from app.schemas.auth import LoginRequest, RegisterRequest, TokenResponse
from app.schemas.user import UserRead
from app.services import auth_service
from app.services.policy import utc

router = APIRouter()


CODE_MINUTES = 10
CODE_ATTEMPTS = 5
RESEND_SECONDS = 45


def code_digest(email: str, code: str) -> str:
    return hashlib.sha256(f"{email}:{code}".encode()).hexdigest()


def signup_email(code: str) -> tuple[str, str]:
    text = (f"Welcome to BornoVerse! Your email verification code is {code}.\n\n"
            f"It expires in {CODE_MINUTES} minutes. If you did not create an account, ignore this email.")
    html = (f"<div style=\"font-family:Arial,sans-serif;max-width:420px\"><h2 style=\"color:#0C7F5F\">BornoVerse</h2>"
            f"<p>Welcome! Confirm your email with this code:</p>"
            f"<p style=\"font-size:30px;font-weight:700;letter-spacing:6px\">{code}</p>"
            f"<p style=\"color:#55675F\">It expires in {CODE_MINUTES} minutes. If you did not create an account, "
            f"you can ignore this email.</p></div>")
    return text, html


class SignupStart(BaseModel):
    email: str = Field(min_length=5, max_length=255)
    username: str = Field(default="", max_length=50)


@router.post("/register/start", summary="Send an email verification code before registering")
async def register_start(data: SignupStart, db: DatabaseDep) -> dict:
    """Checks that the email and username are free, then emails a 6-digit code.
    Returns verification_required=false when the server does not require it."""
    from app.services.mail_service import MailNotConfigured, mail_configured, send_mail
    email = data.email.strip().lower()
    try:
        RegisterRequest.email_format(email)
    except ValueError:
        raise HTTPException(422, "Invalid email address")
    if await db.scalar(select(User.id).where(User.email == email)):
        raise HTTPException(409, "An account with this email already exists")
    if data.username.strip() and await db.scalar(select(User.id).where(User.username == data.username.strip())):
        raise HTTPException(409, "This username is taken")
    if not settings.REQUIRE_EMAIL_VERIFICATION:
        return {"verification_required": False}
    dev_mode = settings.ENVIRONMENT != "production"
    if not mail_configured() and not dev_mode:
        raise HTTPException(503, "Email verification is not configured")
    now = datetime.now(timezone.utc)
    latest = await db.scalar(select(EmailVerification).where(EmailVerification.email == email)
                             .order_by(EmailVerification.created_at.desc()).limit(1))
    if latest and utc(latest.created_at) > now - timedelta(seconds=RESEND_SECONDS):
        raise HTTPException(429, f"Please wait {RESEND_SECONDS} seconds before requesting another code")
    await db.execute(delete(EmailVerification).where(EmailVerification.email == email))
    code = f"{secrets.randbelow(1_000_000):06d}"
    db.add(EmailVerification(email=email, digest=code_digest(email, code),
                             expires_at=now + timedelta(minutes=CODE_MINUTES), created_at=now))
    response = {"verification_required": True, "expires_in": CODE_MINUTES * 60, "resend_after": RESEND_SECONDS}
    if mail_configured():
        text, html = signup_email(code)
        try:
            await send_mail(email, "Verify your BornoVerse email", text, html)
        except MailNotConfigured:
            raise HTTPException(503, "Email verification is not configured")
    else:
        response["dev_code"] = code  # Local development without an email provider.
    await db.commit()
    return response


async def consume_code(db, email: str, code: str | None) -> None:
    invalid = HTTPException(400, "Invalid or expired verification code")
    if not code:
        raise HTTPException(400, "Email verification code is required")
    row = await db.scalar(select(EmailVerification).where(
        EmailVerification.email == email, EmailVerification.used.is_(False))
        .order_by(EmailVerification.created_at.desc()).limit(1).with_for_update())
    if not row or utc(row.expires_at) <= datetime.now(timezone.utc):
        raise invalid
    if row.digest != code_digest(email, code):
        row.attempts += 1
        if row.attempts >= CODE_ATTEMPTS:
            row.used = True
        await db.commit()
        raise HTTPException(400, "Too many attempts. Request a new code." if row.used else "Incorrect verification code")
    row.used = True


@router.post(
    "/register",
    response_model=UserRead,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new user",
)
async def register(
    data: RegisterRequest,
    db: DatabaseDep,
) -> UserRead:
    """Register a new user account with unique username and email. When email
    verification is required, `email_code` must be the code from /register/start."""
    if settings.REQUIRE_EMAIL_VERIFICATION:
        await consume_code(db, data.email, data.email_code)
    user = await auth_service.register_user(db, data)
    return UserRead.model_validate(user)


from typing import Annotated
from fastapi import Depends
from fastapi.security import OAuth2PasswordRequestForm


@router.post(
    "/token",
    response_model=TokenResponse,
    summary="OAuth2 form login (for Swagger UI Authorize)",
)
async def login_oauth(
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    db: DatabaseDep,
) -> TokenResponse:
    """OAuth2 standard form-based login for Swagger UI authorization modal."""
    user = await auth_service.authenticate_user(
        db,
        username_or_email=form_data.username,
        password=form_data.password,
    )
    return auth_service.create_user_token(user)


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="User login with JWT generation",
)
async def login(
    data: LoginRequest,
    db: DatabaseDep,
) -> TokenResponse:
    """Authenticate with username/email and password to receive a JWT access token."""
    user = await auth_service.authenticate_user(
        db,
        username_or_email=data.username_or_email,
        password=data.password,
    )
    return auth_service.create_user_token(user)


@router.get(
    "/me",
    response_model=UserRead,
    summary="Get current authenticated user profile",
)
async def get_auth_me(
    current_user: CurrentUserDep,
) -> UserRead:
    """Retrieve identity of the currently authenticated token bearer."""
    return UserRead.model_validate(current_user)
