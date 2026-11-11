from typing import List, Optional
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    APP_NAME: str = "BornoVerse TTS Service"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False
    TTS_SERVICE_KEY: str = "bornoverse-secure-tts-internal-key-2026"
    HOST: str = "0.0.0.0"
    PORT: int = 8001
    
    # Gemini Configurations
    GEMINI_API_KEY: str = ""
    GEMINI_OCR_MODEL: str = "gemini-3-flash-preview"
    GEMINI_TTS_MODEL: str = "gemini-3.8-flash-tts"
    GEMINI_VOICE: str = "Puck"
    TTS_PROVIDER: str = "gemini"  # "gemini", "edge", "vits", "xtts"

    # More keys (from other Google accounts), comma or newline separated. They are
    # used together with GEMINI_API_KEY in rotation.
    GEMINI_API_KEYS: str = ""
    # Free-tier limits per key for the TTS model.
    GEMINI_TTS_RPM: int = 5
    GEMINI_TTS_RPD: int = 10
    # Narrate only with GEMINI_TTS_MODEL. When every key's daily quota is used, the
    # request is refused (HTTP 429) and the platform waits for the reset instead of
    # switching to Edge/gTTS voices. Set false to allow those fallbacks again.
    GEMINI_TTS_ONLY: bool = True

    @property
    def tts_model(self) -> str:
        """The narration model. A non-speech model name (e.g. an old
        GEMINI_TTS_MODEL=gemini-2.0-flash left in a host's settings) cannot return
        audio, so it is replaced by the speech model instead of failing every page."""
        name = (self.GEMINI_TTS_MODEL or "").strip().strip("\"'")
        return name if "tts" in name.lower() else "gemini-3.8-flash-tts"

    @property
    def effective_gemini_api_key(self) -> str:
        keys = self.gemini_api_keys
        return keys[0] if keys else ""

    @property
    def gemini_api_keys(self) -> List[str]:
        import os
        import re
        raw = ",".join([self.GEMINI_API_KEY, self.GEMINI_API_KEYS, os.environ.get("GOOGLE_API_KEY", "")])
        # Tolerate pasted quotes and ; or newline separators (hosting dashboards).
        keys = (k.strip().strip("\"'") for k in re.split(r"[,;\s]+", raw))
        return list(dict.fromkeys(k for k in keys if k))

    # Model Configurations
    BANGLA_MODEL_REPO: str = "EMTIAZZ/bangladeshi-bangla-tts-vits"
    XTTS_MODEL_NAME: str = "tts_models/multilingual/multi-dataset/xtts_v2"
    USE_CUDA: bool = False
    
    # Platform API Callback
    PLATFORM_API_URL: str = "http://localhost:8000/api/v1"
    
    # Storage / Output directory
    OUTPUT_DIR: str = "output"
    
    # Allowed CORS Origins
    CORS_ORIGINS: List[str] = ["*"]

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
