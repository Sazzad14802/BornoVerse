import os
import sys
import logging
from pathlib import Path

# Ensure UTF-8 output encoding on Windows consoles to prevent charmap errors with Bengali characters
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass
from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Request
from starlette.responses import JSONResponse
import secrets
import threading
from starlette.background import BackgroundTask

_synthesis_lock = threading.Lock()
_ocr_lock = threading.Lock()
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from app.config import settings
from app.schemas.tts import (
    TextRequest,
    SpeakersResponse,
    GenerationJobPayload,
    JobStatusResponse,
)
from app.services.tts_service import tts_service
from app.services.job_service import job_service

# Logging setup
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("tts-service")

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="Dedicated AI TTS Service for Bangla and Multilingual Audio Generation.",
)

@app.middleware("http")
async def service_auth(request: Request, call_next):
    if request.url.path not in {"/health", "/docs", "/openapi.json", "/"}:
        if settings.TTS_SERVICE_KEY:
            key = request.headers.get("X-Service-Key", "")
            if not secrets.compare_digest(key, settings.TTS_SERVICE_KEY):
                return JSONResponse({"detail": "Service authentication required"}, status_code=401)
    return await call_next(request)

@app.post("/extract-page")
async def extract_page(file: UploadFile = File(...), language: str = Form("bn")):
    import asyncio
    from app.services.gemini_service import gemini_service
    """OCR one page. The page is always rendered to an image first, so the text is read
    from what the page looks like, never from its (often broken) embedded text layer.
    Chapter/section titles come back on their own lines starting with '## '."""
    raw = await file.read(20 * 1024 * 1024 + 1)
    if len(raw) > 20 * 1024 * 1024 or not raw.startswith(b"%PDF-"):
        raise HTTPException(400, "Invalid page PDF")
    def extract():
        with _ocr_lock:
            image = render_page_png(raw)
            if image is None:
                return gemini_service.extract_text_from_pdf(raw, language, mark_headings=True)
            if gemini_service.is_configured:
                text = gemini_service.extract_text_from_pdf(image, language, mark_headings=True)
                if text.strip():
                    return text
            from app.services.pdf_service import pdf_service
            try:
                return pdf_service.extract_text_via_ocr(raw)  # local EasyOCR on the rendered page
            except Exception:
                return pdf_service.extract_text(raw, language=language)
    text = await asyncio.to_thread(extract)
    return {"text": text}


TARGET_RATE = 24000


def normalize_wav(path: str) -> None:
    """Rewrite a WAV as 24 kHz, mono, 16-bit, whatever engine produced it. The platform
    joins consecutive pages into one chapter file, which needs identical formats."""
    import wave
    import numpy as np
    try:
        with wave.open(path, "rb") as source:
            channels, width, rate = source.getnchannels(), source.getsampwidth(), source.getframerate()
            frames = source.readframes(source.getnframes())
    except Exception as exc:
        logger.warning("Could not read WAV for normalising: %s", exc)
        return
    if (channels, width, rate) == (1, 2, TARGET_RATE):
        return
    dtype = {1: np.uint8, 2: np.int16, 4: np.int32}.get(width)
    if dtype is None:
        return
    samples = np.frombuffer(frames, dtype=dtype).astype(np.float64)
    if width == 1:
        samples = (samples - 128) * 256
    elif width == 4:
        samples = samples / 65536
    if channels > 1:
        samples = samples.reshape(-1, channels).mean(axis=1)
    if rate != TARGET_RATE and len(samples):
        count = int(round(len(samples) * TARGET_RATE / rate))
        samples = np.interp(np.linspace(0, len(samples) - 1, count), np.arange(len(samples)), samples)
    with wave.open(path, "wb") as target:
        target.setnchannels(1)
        target.setsampwidth(2)
        target.setframerate(TARGET_RATE)
        target.writeframes(np.clip(samples, -32768, 32767).astype(np.int16).tobytes())


def render_page_png(pdf_bytes: bytes, scale: float = 2.0):
    """First page of a PDF as PNG bytes (None if it cannot be rendered)."""
    try:
        import io
        import pypdfium2 as pdfium
        pdf = pdfium.PdfDocument(io.BytesIO(pdf_bytes))
        image = pdf[0].render(scale=scale).to_pil()
        out = io.BytesIO()
        image.save(out, format="PNG")
        return out.getvalue()
    except Exception as exc:
        logger.warning("Page rendering failed (%s); using the PDF directly", exc)
        return None

# CORS setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    return {
        "service": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "status": "online",
        "endpoints": {
            "health": "/health",
            "speakers": "/speakers",
            "generate": "POST /generate",
            "jobs": "POST /jobs",
            "job_status": "GET /jobs/{job_id}",
        },
    }


@app.get("/health")
def health_check():
    return {"status": "ok", "service": "tts-service"}


@app.get("/speakers", response_model=SpeakersResponse)
def get_speakers():
    """Retrieve list of available TTS voices and speakers."""
    speakers = tts_service.get_speakers()
    return SpeakersResponse(speakers=speakers)


@app.post("/generate")
def generate_audio(request: TextRequest):
    """
    Direct TTS generation endpoint.
    Synthesizes speech text and streams back the resulting WAV audio.
    """
    if not request.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty.")

    try:
        with _synthesis_lock:
            audio_path = tts_service.synthesize(
                text=request.text,
                language=request.language,
                speaker=request.speaker,
                model_type=request.model_type,
            )

        normalize_wav(audio_path)
        filename = Path(audio_path).name
        return FileResponse(
            path=audio_path,
            media_type="audio/wav",
            filename=filename,
            background=BackgroundTask(Path(audio_path).unlink, missing_ok=True),
        )
    except Exception as exc:
        logger.error("TTS generation failed: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/jobs", response_model=JobStatusResponse)
async def create_job(payload: GenerationJobPayload):
    """
    Job dispatcher endpoint called by Platform API HTTPGenerationDispatcher.
    Queues asynchronous audio generation for an uploaded audiobook.
    """
    raise HTTPException(410, "Use the Platform API durable queue worker")


@app.get("/jobs/{job_id}", response_model=JobStatusResponse)
def get_job_status(job_id: str):
    """Query progress and output of a generation job."""
    return job_service.get_job_status(job_id)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host=settings.HOST, port=settings.PORT, reload=True)
