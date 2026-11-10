import asyncio
import hashlib
import secrets
from datetime import datetime, timezone, timedelta
import jwt
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import delete, select
from app.api.deps import DatabaseDep, CurrentUserDep
from app.core.config import settings
from app.core.security import hash_password
from app.models import User
from app.models.platform import RecoveryToken
from app.schemas.auth import LoginRequest, RegisterRequest
from app.services.auth_service import authenticate_user, create_user_token, get_user_by_email
from app.services.policy import utc, audit

router = APIRouter()

@router.post("/admin-login")
async def admin_login(data: LoginRequest, db: DatabaseDep):
    user = await authenticate_user(db, data.username_or_email, data.password, "admin")
    return create_user_token(user)

@router.post("/session/renew")
async def renew_session(user: CurrentUserDep):
    """Swap a still-valid token for a fresh one, so a signed-in device never expires
    while it is used. Revoked tokens (sign-out, password reset, suspension) fail here."""
    return create_user_token(user)

@router.post("/logout")
async def logout(db: DatabaseDep, user: CurrentUserDep):
    from sqlalchemy import delete
    from app.models.notification import PushToken
    user.token_version += 1
    # Revoked sessions must stop receiving pushes on every device.
    await db.execute(delete(PushToken).where(PushToken.user_id == user.id))
    await db.commit()
    return {"message": "All sessions revoked"}

class RecoveryRequest(BaseModel):
    email: str = Field(max_length=255)

class VerifyRequest(BaseModel):
    email: str = Field(max_length=255)
    code: str = Field(pattern=r"^\d{6}$")

class ResetRequest(BaseModel):
    token: str = Field(min_length=20, max_length=200)
    password: str = Field(min_length=8, max_length=72)

    @field_validator("password")
    @classmethod
    def password_rules(cls, value):
        from app.schemas.auth import check_password
        return check_password(value)

CODE_MINUTES = 10
CODE_ATTEMPTS = 5
RESEND_SECONDS = 45

def digest(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()

def recovery_email(code: str) -> tuple[str, str]:
    text = (f"Your BornoVerse verification code is {code}.\n\n"
            f"It expires in {CODE_MINUTES} minutes. If you did not ask to reset your password, ignore this email.")
    html = (f"<div style=\"font-family:Arial,sans-serif;max-width:420px\"><h2 style=\"color:#0C7F5F\">BornoVerse</h2>"
            f"<p>Your verification code is</p><p style=\"font-size:30px;font-weight:700;letter-spacing:6px\">{code}</p>"
            f"<p style=\"color:#55675F\">It expires in {CODE_MINUTES} minutes. If you did not ask to reset your password, "
            f"you can ignore this email.</p></div>")
    return text, html

@router.post("/recovery")
async def recover(data: RecoveryRequest, db: DatabaseDep):
    """Email a 6-digit code. The reply never reveals whether the account exists."""
    from app.services.mail_service import MailNotConfigured, mail_configured, send_mail
    dev_mode = settings.ENVIRONMENT != "production"
    if not mail_configured() and not dev_mode:
        raise HTTPException(503, "Password recovery email is not configured")
    response = {"message": "If this account exists, a verification code has been sent.",
                "expires_in": CODE_MINUTES * 60, "resend_after": RESEND_SECONDS}
    user = await get_user_by_email(db, data.email.strip().lower())
    if not user or user.account_type != "user":
        return response
    now = datetime.now(timezone.utc)
    latest = await db.scalar(select(RecoveryToken).where(RecoveryToken.user_id == user.id, RecoveryToken.kind == "code")
                             .order_by(RecoveryToken.created_at.desc()).limit(1))
    if latest and latest.created_at and utc(latest.created_at) > now - timedelta(seconds=RESEND_SECONDS):
        raise HTTPException(429, f"Please wait {RESEND_SECONDS} seconds before requesting another code")
    # Only the newest code is valid; earlier ones are discarded.
    await db.execute(delete(RecoveryToken).where(RecoveryToken.user_id == user.id, RecoveryToken.kind == "code"))
    code = f"{secrets.randbelow(1_000_000):06d}"
    db.add(RecoveryToken(digest=digest(f"{user.id}:{code}"), user_id=user.id, kind="code",
                         expires_at=now + timedelta(minutes=CODE_MINUTES), created_at=now))
    if mail_configured():
        text, html = recovery_email(code)
        try:
            await send_mail(user.email, "Your BornoVerse verification code", text, html)
        except MailNotConfigured:
            raise HTTPException(503, "Password recovery email is not configured")
    elif dev_mode:
        # Local development without an email provider: hand the code back.
        response["dev_code"] = code
    await db.commit()
    return response

@router.post("/recovery/verify")
async def verify_code(data: VerifyRequest, db: DatabaseDep):
    """Exchange a valid code for a one-time reset token (15 minutes)."""
    invalid = HTTPException(400, "Invalid or expired code")
    user = await get_user_by_email(db, data.email.strip().lower())
    if not user:
        raise invalid
    row = await db.scalar(select(RecoveryToken).where(RecoveryToken.user_id == user.id, RecoveryToken.kind == "code",
                          RecoveryToken.used.is_(False)).order_by(RecoveryToken.created_at.desc()).limit(1).with_for_update())
    if not row or utc(row.expires_at) <= datetime.now(timezone.utc):
        raise invalid
    if row.digest != digest(f"{user.id}:{data.code}"):
        row.attempts += 1
        if row.attempts >= CODE_ATTEMPTS:
            row.used = True
        await db.commit()
        raise HTTPException(400, "Too many attempts. Request a new code." if row.used else "Incorrect code")
    row.used = True
    token = secrets.token_urlsafe(32)
    db.add(RecoveryToken(digest=digest(token), user_id=user.id, kind="reset",
                         expires_at=datetime.now(timezone.utc) + timedelta(minutes=15)))
    await db.commit()
    return {"token": token}

@router.post("/reset-password")
async def reset(data: ResetRequest, db: DatabaseDep):
    if len(data.password.encode()) > 72:
        raise HTTPException(422, "Password exceeds 72 UTF-8 bytes")
    row = await db.scalar(select(RecoveryToken).where(RecoveryToken.digest == digest(data.token),
                          RecoveryToken.kind == "reset").with_for_update())
    if not row or row.used or utc(row.expires_at) <= datetime.now(timezone.utc):
        raise HTTPException(400, "Invalid or expired recovery code")
    user = await db.get(User, row.user_id)
    user.password_hash = hash_password(data.password)
    user.token_version += 1
    row.used = True
    audit(db, user, "password.reset", user.id)
    await db.commit()
    return {"message": "Password reset. Sign in again."}

class GoogleRequest(BaseModel):
    id_token: str = Field(max_length=10000)

def google_claims(token):
    if not settings.GOOGLE_CLIENT_IDS:
        raise HTTPException(503, "Google sign-in is not configured")
    try:
        key = jwt.PyJWKClient("https://www.googleapis.com/oauth2/v3/certs").get_signing_key_from_jwt(token)
        claims = jwt.decode(token, key.key, algorithms=["RS256"], audience=settings.GOOGLE_CLIENT_IDS.split(","))
        if claims.get("iss") not in {"accounts.google.com", "https://accounts.google.com"} or claims.get("email_verified") is not True:
            raise ValueError("Unverified Google identity")
        return claims
    except Exception:
        raise HTTPException(401, "Invalid Google identity token")

class SupabaseRequest(BaseModel):
    access_token: str = Field(min_length=20, max_length=10000)


async def supabase_identity(access_token: str) -> dict:
    """Ask Supabase Auth who this token belongs to (server-side validation)."""
    import httpx
    if not settings.SUPABASE_URL or not settings.SUPABASE_ANON_KEY:
        raise HTTPException(503, "Google sign-in is not configured")
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.get(
                f"{settings.SUPABASE_URL.rstrip('/')}/auth/v1/user",
                headers={"Authorization": f"Bearer {access_token}", "apikey": settings.SUPABASE_ANON_KEY},
            )
    except httpx.HTTPError:
        raise HTTPException(502, "Identity provider is unreachable")
    if response.status_code != 200:
        raise HTTPException(401, "Invalid or expired Google sign-in")
    return response.json()


@router.post("/supabase", summary="Exchange a Supabase Google session for a BornoVerse session")
async def supabase_login(data: SupabaseRequest, db: DatabaseDep):
    identity = await supabase_identity(data.access_token)
    providers = set((identity.get("app_metadata") or {}).get("providers") or [])
    email = (identity.get("email") or "").strip().lower()
    # Only identities verified by Google may sign in, so the email is proven.
    if "google" not in providers or not email:
        raise HTTPException(401, "A verified Google account is required")
    user = await get_user_by_email(db, email)
    if user and user.account_type != "user":
        raise HTTPException(403, "Use the admin portal for administrator accounts")
    if not user:
        from app.services.auth_service import register_user
        metadata = identity.get("user_metadata") or {}
        base = "".join(ch for ch in email.split("@")[0].lower() if ch.isalnum() or ch == "_")[:30] or "user"
        user = await register_user(db, RegisterRequest(
            email=email, username=f"{base}_{secrets.token_hex(3)}", password=secrets.token_urlsafe(32)[:58] + "a1",
            full_name=(metadata.get("full_name") or metadata.get("name") or "")[:150]))
        audit(db, user, "account.google_signup", user.id)
        await db.commit()
    if user.suspended:
        raise HTTPException(403, "Account suspended")
    return create_user_token(user)


@router.post("/google")
async def google(data: GoogleRequest, db: DatabaseDep):
    claims = await asyncio.to_thread(google_claims, data.id_token)
    user = await get_user_by_email(db, claims["email"])
    if user and user.account_type != "user":
        raise HTTPException(403, "Use the admin portal for administrator accounts")
    if not user:
        from app.services.auth_service import register_user
        user = await register_user(db, RegisterRequest(email=claims["email"],
            username="google_" + secrets.token_hex(8), password=secrets.token_urlsafe(32) + "a1",
            full_name=claims.get("name", "")))
    if user.suspended:
        raise HTTPException(403, "Account suspended")
    return create_user_token(user)
