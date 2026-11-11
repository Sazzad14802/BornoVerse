import os
import logging
from pathlib import Path
from typing import Optional, List, Dict

from app.config import settings

logger = logging.getLogger(__name__)


class TTSService:
    """
    Unified Text-to-Speech service.
    Supports:
    1. Native Bangladeshi Bangla VITS (EMTIAZZ/bangladeshi-bangla-tts-vits)
    2. Coqui Multilingual XTTS v2 (tts_models/multilingual/multi-dataset/xtts_v2)
    """

    def __init__(self):
        self._bangla_synthesizer = None
        self._xtts_model = None
        # Anchor output directory to tts-service/output
        if Path(settings.OUTPUT_DIR).is_absolute():
            self.output_dir = Path(settings.OUTPUT_DIR)
        else:
            self.output_dir = Path(__file__).resolve().parents[2] / settings.OUTPUT_DIR
        self.output_dir.mkdir(parents=True, exist_ok=True)

    @property
    def bangla_synthesizer(self):
        """Lazy-loaded Bangla VITS synthesizer."""
        if self._bangla_synthesizer is None:
            logger.info("Initializing Bangla VITS model (%s)...", settings.BANGLA_MODEL_REPO)
            try:
                from huggingface_hub import hf_hub_download
                from TTS.utils.synthesizer import Synthesizer

                model_path = hf_hub_download(
                    repo_id=settings.BANGLA_MODEL_REPO,
                    filename="pytorch_model.pth"
                )
                config_path = hf_hub_download(
                    repo_id=settings.BANGLA_MODEL_REPO,
                    filename="config.json"
                )

                self._bangla_synthesizer = Synthesizer(
                    tts_checkpoint=model_path,
                    tts_config_path=config_path,
                    use_cuda=settings.USE_CUDA,
                )
                logger.info("Bangla VITS model successfully loaded!")
            except Exception as exc:
                logger.error("Failed to load Bangla VITS model: %s", exc)
                raise RuntimeError(f"Could not load Bangla VITS model: {exc}") from exc
        return self._bangla_synthesizer

    @property
    def xtts_model(self):
        """Lazy-loaded XTTS v2 model."""
        if self._xtts_model is None:
            logger.info("Initializing XTTS v2 model (%s)...", settings.XTTS_MODEL_NAME)
            try:
                from TTS.api import TTS
                self._xtts_model = TTS(settings.XTTS_MODEL_NAME, gpu=settings.USE_CUDA)
                logger.info("XTTS v2 model successfully loaded!")
            except Exception as exc:
                logger.error("Failed to load XTTS v2 model: %s", exc)
                raise RuntimeError(f"Could not load XTTS v2 model: {exc}") from exc
        return self._xtts_model

    def get_speakers(self) -> List[Dict[str, str]]:
        """Return available TTS speaker voices."""
        from app.services.gemini_service import gemini_service
        return gemini_service.get_speakers()

    def synthesize(
        self,
        text: str,
        language: str = "bn",
        speaker: Optional[str] = None,
        model_type: Optional[str] = None,
        output_filename: Optional[str] = None,
    ) -> str:
        """
        Synthesize speech text to an audio file and return the filepath.
        Prefers Gemini API / Neural Bengali generation, with local VITS fallback.
        """
        if settings.TTS_PROVIDER == "gemini" or model_type in ("gemini", "edge", "neural") or not model_type:
            try:
                from app.services.gemini_service import gemini_service
                return gemini_service.synthesize(
                    text=text,
                    language=language,
                    speaker=speaker,
                    model_type=model_type,
                    output_filename=output_filename,
                )
            except Exception as exc:
                if settings.GEMINI_TTS_ONLY:
                    raise  # only the Gemini TTS voice is allowed: no local engine
                logger.warning("Gemini synthesis pipeline failed: %s; trying local engine...", exc)

        if not output_filename:
            import uuid
            output_filename = f"tts_{uuid.uuid4().hex[:8]}.wav"

        output_path = self.output_dir / output_filename

        is_bangla = language.lower() in ("bn", "bangla", "bengali")
        use_bangla_model = (model_type == "bangla_vits") or (is_bangla and model_type != "xtts")

        if use_bangla_model:
            logger.info("Synthesizing with Bangla VITS Engine...")
            synth = self.bangla_synthesizer
            from app.services.pdf_service import pdf_service
            chunks = pdf_service.chunk_text(text, max_chunk_chars=300)
            if not chunks:
                chunks = [text]

            logger.info("Synthesizing %d chunk(s) with Bangla VITS...", len(chunks))
            all_wavs = []
            pause = [0] * int(22050 * 0.25)  # 250ms pause between chunks
            for idx, chunk in enumerate(chunks):
                if not chunk.strip():
                    continue
                logger.info("Synthesizing chunk %d/%d (%d chars)...", idx + 1, len(chunks), len(chunk))
                wav = synth.tts(chunk)
                if all_wavs:
                    all_wavs.extend(pause)
                all_wavs.extend(wav)

            synth.save_wav(all_wavs, str(output_path))
        else:
            logger.info("Synthesizing with XTTS v2 Engine...")
            # Default to Aaron Dreschner for English narration
            if not speaker or speaker.strip().lower() in ("aaron", "aaron dreschner", "default", "damien black"):
                chosen_speaker = "Aaron Dreschner"
            else:
                chosen_speaker = speaker

            lang_lower = language.lower()
            if lang_lower in ("en", "english", "eng"):
                target_lang = "en"
            elif is_bangla and model_type == "xtts":
                target_lang = "en"
            else:
                target_lang = lang_lower

            self.xtts_model.tts_to_file(
                text=text,
                language=target_lang,
                speaker=chosen_speaker,
                file_path=str(output_path),
            )

        logger.info("Audio saved to %s", output_path)
        return str(output_path)


tts_service = TTSService()
