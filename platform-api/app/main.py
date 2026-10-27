"""
FastAPI application entry point and factory.
Configures CORS, routers, static file mounting, and health checks.
"""

from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles

from app.api.v1.router import api_router
from app.core.config import settings


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.APP_NAME,
        version=settings.APP_VERSION,
        description=(
            "Backend API for the Audiobook Streaming Platform. "
            "Handles user authentication, audiobook management, public discovery, "
            "chapters, personal libraries, playback progress, PDF document uploads, "
            "and asynchronous generation job coordination with the Model Runner."
        ),
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_url="/openapi.json",
    )

    # ── Middleware ─────────────────────────────────────────────────────────
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ── Static Uploads Serving ─────────────────────────────────────────────
    # Creates uploads directory and mounts it for local static file delivery
    upload_path = Path(settings.UPLOAD_DIR)
    upload_path.mkdir(parents=True, exist_ok=True)
    # Uploads are private. Audio is served only through authorized media endpoints.
    from app.core.rate_limit import install_rate_limits
    install_rate_limits(app)
    if settings.ENVIRONMENT == "production":
        if (settings.MOCK_PAYMENTS_ENABLED or len(settings.JWT_SECRET_KEY) < 32
                or any(marker in settings.JWT_SECRET_KEY.lower() for marker in ["insecure-development", "change-this", "replace-me"])):
            raise RuntimeError("Production requires a strong JWT secret and disabled mock payments")
        if settings.ALLOWED_ORIGINS == "*" or not settings.TTS_SERVICE_KEY:
            raise RuntimeError("Production requires explicit CORS origins and a TTS service key")

    # ── Health check ───────────────────────────────────────────────────────
    # HEAD as well as GET: uptime monitors (UptimeRobot) send HEAD requests.
    @app.api_route("/health", methods=["GET", "HEAD"], tags=["health"], summary="Health check")
    async def health() -> dict:
        """Returns a simple OK response to confirm the API is alive and running."""
        return {"status": "ok", "version": settings.APP_VERSION}

    # ── Root redirect to documentation ─────────────────────────────────────
    @app.get("/", include_in_schema=False)
    async def root():
        return RedirectResponse(url="/docs")

    # ── API routers ────────────────────────────────────────────────────────
    app.include_router(api_router, prefix="/api/v1")

    return app


app = create_app()  # BornoVerse Platform API
