"""
Application configuration using pydantic-settings.
All credentials and environment variables are loaded here.
"""

from typing import Optional
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── App ────────────────────────────────────────────────────────────────
    APP_NAME: str = "BornoVerse API"
    APP_VERSION: str = "0.1.0"
    DEBUG: bool = False
    ENVIRONMENT: str = "development"
    MOCK_PAYMENTS_ENABLED: bool = False
    TTS_SERVICE_KEY: str = "bornoverse-secure-tts-internal-key-2026"
    TTS_GENERATE_URL: str = "http://localhost:8001/generate"
    TTS_EXTRACT_URL: str = "http://localhost:8001/extract-page"
    GEMINI_API_KEY: str = ""
    GOOGLE_CLIENT_IDS: str = ""
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    MAIL_FROM: str = ""
    RECOVERY_URL: str = "bornoverse://reset-password"
    # Send Expo push notifications for in-app notifications (disable in tests/offline dev).
    PUSH_NOTIFICATIONS_ENABLED: bool = True

    # ── Supabase (Google sign-in identity provider) ───────────────────────
    SUPABASE_URL: str = ""
    SUPABASE_ANON_KEY: str = ""

    # ── Payments (SSLCommerz) ──────────────────────────────────────────────
    SSLCOMMERZ_STORE_ID: str = ""
    SSLCOMMERZ_STORE_PASSWORD: str = ""
    SSLCOMMERZ_SANDBOX: bool = True
    # Public base URL SSLCommerz and the phone browser use to reach this API
    # (e.g. https://api.example.com). Empty = derive from the incoming request (LAN dev).
    PUBLIC_API_BASE_URL: str = ""
    # Schemes the app may ask to be redirected to after checkout (deep links only).
    PAYMENT_RETURN_SCHEMES: str = "bornoverse,exp,exps"

    # ── Server ─────────────────────────────────────────────────────────────
    HOST: str = "0.0.0.0"
    PORT: int = 8000

    # ── CORS ───────────────────────────────────────────────────────────────
    # Comma-separated list of allowed origins, or "*"
    ALLOWED_ORIGINS: str = "*"

    @property
    def cors_origins(self) -> list[str]:
        if self.ALLOWED_ORIGINS == "*":
            return ["*"]
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",") if o.strip()]

    # ── Database ───────────────────────────────────────────────────────────
    # Async connection string for FastAPI application (SQLAlchemy AsyncEngine)
    DATABASE_URL: str = "postgresql+asyncpg://postgres:12345@localhost:5432/audiobook_db"
    
    # Sync connection string for Alembic migrations (optional override)
    SYNC_DATABASE_URL: Optional[str] = None

    @field_validator(
        "SSLCOMMERZ_STORE_ID", "SSLCOMMERZ_STORE_PASSWORD", "SUPABASE_URL", "SUPABASE_ANON_KEY",
        "SUPABASE_SERVICE_ROLE_KEY", "DATABASE_URL", mode="before",
    )
    @classmethod
    def strip_pasted_value(cls, value):
        """Dashboard text boxes (Render) keep trailing spaces and newlines from a paste."""
        return value.strip() if isinstance(value, str) else value

    @field_validator("DATABASE_URL")
    @classmethod
    def asyncpg_url(cls, url: str) -> str:
        """
        Accept a hosted provider's plain URL (Neon, Supabase, Render), e.g.
        postgresql://u:p@host/db?sslmode=require&channel_binding=require, and
        rewrite it for asyncpg, which takes `ssl` and rejects libpq-only options.
        """
        for prefix in ("postgres://", "postgresql://"):
            if url.startswith(prefix):
                url = "postgresql+asyncpg://" + url[len(prefix):]
        if not url.startswith("postgresql+asyncpg://"):
            return url
        parts = urlsplit(url)
        query = {}
        for key, value in parse_qsl(parts.query):
            if key == "sslmode":
                query["ssl"] = value
            elif key != "channel_binding":
                query[key] = value
        return urlunsplit(parts._replace(query=urlencode(query)))

    @property
    def sync_database_url(self) -> str:
        """Returns a synchronous database URL for Alembic migrations."""
        if self.SYNC_DATABASE_URL:
            return self.SYNC_DATABASE_URL
        # Replace async driver with sync driver (psycopg); libpq wants sslmode, not ssl
        url = self.DATABASE_URL
        if "+asyncpg" in url:
            return url.replace("+asyncpg", "+psycopg").replace("ssl=", "sslmode=")
        if "+aiosqlite" in url:
            return url.replace("+aiosqlite", "")
        return url

    # ── Security & Authentication ──────────────────────────────────────────
    JWT_SECRET_KEY: str = "insecure-development-secret-key-change-in-production-1234567890"
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 hours

    # ── Storage ────────────────────────────────────────────────────────────
    # "local" keeps files on disk only; "supabase" also mirrors them to Supabase
    # Storage so they survive restarts on hosts with an ephemeral disk (Render).
    STORAGE_TYPE: str = "local"
    UPLOAD_DIR: str = "uploads"
    SUPABASE_SERVICE_ROLE_KEY: str = ""
    SUPABASE_STORAGE_BUCKET: str = "media"
    MAX_UPLOAD_SIZE_MB: int = 50

    # ── Model Runner Dispatcher ────────────────────────────────────────────
    # Dispatcher strategy for AI Model Runner boundary
    MODEL_RUNNER_DISPATCHER: str = "http"  # "mock", "http"
    MODEL_RUNNER_URL: str = "http://localhost:8001/jobs"


settings = Settings()
