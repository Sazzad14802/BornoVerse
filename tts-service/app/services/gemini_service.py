import io
import os
import uuid
import wave
import logging
from pathlib import Path
from typing import Optional, List, Dict

from app.config import settings

logger = logging.getLogger(__name__)


def convert_pcm_to_wav(
    pcm_bytes: bytes,
    sample_rate: int = 24000,
    channels: int = 1,
    sampwidth: int = 2
) -> bytes:
    """
    Converts raw 16-bit linear PCM audio bytes to a standard RIFF WAV container.
    If the bytes are already in WAV format (start with 'RIFF'), returns them unmodified.
    """
    if pcm_bytes.startswith(b"RIFF"):
        return pcm_bytes

    out = io.BytesIO()
    with wave.open(out, "wb") as wf:
        wf.setnchannels(channels)
        wf.setsampwidth(sampwidth)
        wf.setframerate(sample_rate)
        wf.writeframes(pcm_bytes)
    return out.getvalue()


def convert_mp3_to_wav(mp3_bytes: bytes) -> bytes:
    """
    Decodes MP3 audio bytes to a standard RIFF WAV container using miniaudio.
    """
    try:
        import miniaudio
        decoded = miniaudio.decode(mp3_bytes)
        out = io.BytesIO()
        with wave.open(out, "wb") as wf:
            wf.setnchannels(decoded.nchannels)
            wf.setsampwidth(decoded.sample_width)
            wf.setframerate(decoded.sample_rate)
            wf.writeframes(decoded.samples)
        return out.getvalue()
    except Exception as exc:
        logger.warning("miniaudio decoding failed: %s; falling back to raw bytes", exc)
        return mp3_bytes


class GeminiService:
    """
    Service for OCR text extraction and TTS audio generation using Google Gemini API
    with robust multi-tier fallback pipelines.
    """

    def __init__(self):
        # Anchor output directory to tts-service/output
        if Path(settings.OUTPUT_DIR).is_absolute():
            self.output_dir = Path(settings.OUTPUT_DIR)
        else:
            self.output_dir = Path(__file__).resolve().parents[2] / settings.OUTPUT_DIR
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self._clients: Dict[str, object] = {}
        from app.services.key_pool import KeyPool
        self.pool = KeyPool(settings.gemini_api_keys, settings.GEMINI_TTS_RPM, settings.GEMINI_TTS_RPD,
                            self.output_dir / "gemini_key_usage.json")

    @property
    def api_key(self) -> str:
        return settings.effective_gemini_api_key

    @property
    def is_configured(self) -> bool:
        return bool(settings.gemini_api_keys)

    def client_for(self, key: str):
        """One Google GenAI client per API key (created on first use)."""
        if key not in self._clients:
            from google import genai
            self._clients[key] = genai.Client(api_key=key)
        return self._clients[key]

    def get_genai_client(self):
        """Client for the first key (kept for callers that do not rotate)."""
        return self.client_for(self.api_key) if self.is_configured else None

    def extract_text_from_pdf(self, pdf_bytes: bytes, language: str = "bn", mark_headings: bool = False) -> str:
        """
        Extracts high-fidelity Bengali and English text from PDF pages using Gemini Vision.
        If Gemini is unconfigured or encounters an error, seamlessly falls back to pypdf / EasyOCR.
        """
        if self.is_configured:
            try:
                from google.genai import types

                logger.info(
                    "Executing Gemini OCR (model: %s, size: %d bytes)...",
                    settings.GEMINI_OCR_MODEL,
                    len(pdf_bytes),
                )

                prompt = (
                    "You are an expert document OCR transcription system specialized in Bengali and English texts.\n"
                    "Transcribe all text from the provided document page verbatim.\n"
                    "- Preserve exact Bengali spelling, conjunct letters (যুক্তবর্ণ), punctuation (especially Bengali Dari '।'), quotes, and numbers.\n"
                    "- Preserve line breaks and paragraph structure.\n"
                    "- Do not translate or change any words.\n"
                    "- Do not summarize, explain, or edit the content.\n"
                    "- Do not include any greeting, markdown backtick fences (```), commentary, or introductory notes.\n"
                    "- Output ONLY the exact transcribed text content."
                )
                if mark_headings:
                    prompt += (
                        "\n- If the page starts a new chapter or major section, put that chapter/section title on its "
                        "own line starting with '## ' (for example '## অধ্যায় ১: শুরু' or '## Chapter 2'). Mark only real "
                        "chapter or section titles, never running headers, page numbers or ordinary bold text.\n"
                        "- Leave out running headers, footers and page numbers."
                    )

                # Determine MIME type: PDF or rendered image
                mime_type = "application/pdf"
                if pdf_bytes.startswith(b"\x89PNG"):
                    mime_type = "image/png"
                elif pdf_bytes.startswith(b"\xff\xd8"):
                    mime_type = "image/jpeg"

                candidate_ocr_models = [
                    settings.GEMINI_OCR_MODEL,
                    "gemini-3-flash-preview",
                    "gemini-3.1-flash-lite",
                    "gemini-3.8-flash",
                ]
                from app.services.key_pool import is_rate_limit, mask
                extracted_text = ""
                # OCR has its own quota on every key: on a rate limit, the same model is
                # tried with the next key before moving to another model.
                for ocr_model in dict.fromkeys(candidate_ocr_models):
                    for key in self.pool.keys:
                        try:
                            logger.info("Executing Gemini OCR with model '%s' (key %s)...", ocr_model, mask(key))
                            response = self.client_for(key).models.generate_content(
                                model=ocr_model,
                                contents=[
                                    types.Part.from_bytes(
                                        data=pdf_bytes,
                                        mime_type=mime_type,
                                    ),
                                    prompt,
                                ],
                            )
                            extracted_text = (response.text or "").strip()
                            break
                        except Exception as model_err:
                            if is_rate_limit(model_err):
                                logger.warning("Gemini OCR key %s is rate-limited for '%s'", mask(key), ocr_model)
                                continue
                            logger.warning("Gemini OCR failed for model '%s': %s", ocr_model, model_err)
                            break
                    if extracted_text:
                        break

                if extracted_text:
                    logger.info("Gemini OCR succeeded: extracted %d characters.", len(extracted_text))
                    from app.services.pdf_service import pdf_service
                    return pdf_service.clean_text(extracted_text)
                else:
                    logger.warning("Gemini OCR returned empty text. Falling back to local OCR...")

            except Exception as exc:
                logger.warning("Gemini OCR encountered an error: %s. Falling back to local extractor...", exc)

        # Fallback to local pypdf + EasyOCR pipeline
        from app.services.pdf_service import pdf_service
        logger.info("Running local PDF extraction fallback...")
        return pdf_service.extract_text(pdf_bytes, language=language)

    async def _synthesize_edge_tts(self, text: str, language: str = "bn", voice: Optional[str] = None) -> bytes:
        """Synthesize Bengali / English speech using Microsoft Edge Neural TTS."""
        import edge_tts
        lang_lower = language.lower()
        is_bangla = lang_lower in ("bn", "bangla", "bengali")

        if not voice:
            if is_bangla:
                chosen_voice = "bn-BD-PradeepNeural"
            else:
                chosen_voice = "en-US-GuyNeural"
        else:
            chosen_voice = voice

        logger.info("Synthesizing speech via Edge Neural TTS (voice: %s)...", chosen_voice)
        communicate = edge_tts.Communicate(text, chosen_voice)
        audio_chunks = []
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio_chunks.append(chunk["data"])

        mp3_bytes = b"".join(audio_chunks)
        wav_bytes = convert_mp3_to_wav(mp3_bytes)
        return wav_bytes

    def _synthesize_gtts(self, text: str, language: str = "bn") -> bytes:
        """Synthesize speech using Google Text-to-Speech (gTTS)."""
        from gtts import gTTS
        lang_lower = language.lower()
        is_bangla = lang_lower in ("bn", "bangla", "bengali")
        target_lang = "bn" if is_bangla else "en"

        logger.info("Synthesizing speech via gTTS (lang: %s)...", target_lang)
        tts = gTTS(text=text, lang=target_lang, slow=False)
        buffer = io.BytesIO()
        tts.write_to_fp(buffer)
        mp3_bytes = buffer.getvalue()
        return convert_mp3_to_wav(mp3_bytes)

    def _synthesize_gemini(self, text: str, voice_name: str = "Puck") -> Optional[bytes]:
        """
        Attempts direct Gemini API speech generation via response_modalities=['AUDIO'].
        Returns WAV bytes on success, or None if unsupported/unavailable.
        """
        if not self.is_configured:
            return None

        from google.genai import types
        import time
        from app.services.key_pool import is_bad_key, is_rate_limit, mask
        transient = 0

        # Only the configured TTS model (gemini-3.8-flash-tts); keys rotate within its quota.
        model = settings.GEMINI_TTS_MODEL

        # Send only the text to narrate: TTS models speak the whole prompt, so any
        # instruction placed here would be read aloud at the start of the audio.
        prompt = text

        # Each attempt uses the key with the most room left; a 429 takes that key out
        # (for a minute or for the day) and the next one is tried. When every key's day
        # is used up, acquire() raises QuotaExhausted.
        for _ in range(len(self.pool.keys) * 2 + 4):
            key = self.pool.acquire(model)
            client = self.client_for(key)
            try:
                logger.info("Attempting Gemini audio generation with model '%s' and voice '%s'...", model, voice_name)
                config = types.GenerateContentConfig(
                    response_modalities=["AUDIO"],
                    speech_config=types.SpeechConfig(
                        voice_config=types.VoiceConfig(
                            prebuilt_voice_config=types.PrebuiltVoiceConfig(
                                voice_name=voice_name
                            )
                        )
                    ),
                )

                response = client.models.generate_content(
                    model=model,
                    contents=prompt,
                    config=config,
                )

                for candidate in (response.candidates or []):
                    content = getattr(candidate, "content", None)
                    if not content:
                        continue
                    for part in (getattr(content, "parts", []) or []):
                        inline_data = getattr(part, "inline_data", None)
                        if inline_data and getattr(inline_data, "data", None):
                            raw_audio = inline_data.data
                            mime = getattr(inline_data, "mime_type", "")
                            logger.info("Received audio stream from Gemini (mime: %s, bytes: %d)", mime, len(raw_audio))
                            wav_data = convert_pcm_to_wav(raw_audio, sample_rate=24000)
                            return wav_data

                # The TTS model sometimes answers without audio; another try usually works.
                logger.warning("Gemini returned no audio for this text (key %s); retrying", mask(key))
                time.sleep(2)
            except Exception as exc:
                if is_rate_limit(exc):
                    self.pool.report_limit(key, model, exc)
                    continue
                if is_bad_key(exc):
                    self.pool.disable(key, model, exc)
                    continue
                # Overloaded (500/503), timeouts and other passing errors: back off and try
                # again (on the next key); give up after a few attempts.
                transient += 1
                logger.warning("Gemini TTS error (attempt %d) with key %s: %s", transient, mask(key), exc)
                if transient >= 4:
                    return None
                time.sleep(min(20, 3 * 2 ** (transient - 1)))

        return None

    def synthesize(
        self,
        text: str,
        language: str = "bn",
        speaker: Optional[str] = None,
        model_type: Optional[str] = None,
        output_filename: Optional[str] = None,
    ) -> str:
        """
        Primary speech synthesis pipeline:
        1. Attempts Gemini API audio generation if configured.
        2. Falls back to high-fidelity Neural Bengali TTS (Edge TTS).
        3. Falls back to Google Text-to-Speech (gTTS).
        4. Raises if every engine fails; otherwise writes a WAV readable by wave.open().
        """
        if not output_filename:
            output_filename = f"tts_{uuid.uuid4().hex[:8]}.wav"

        output_path = self.output_dir / output_filename
        wav_bytes: Optional[bytes] = None

        voice_choice = speaker or settings.GEMINI_VOICE or "Puck"

        # 1. Gemini API Audio Generation
        from app.services.key_pool import QuotaExhausted
        if settings.TTS_PROVIDER == "gemini" and self.is_configured:
            try:
                wav_bytes = self._synthesize_gemini(text=text, voice_name=voice_choice)
                if wav_bytes:
                    logger.info("Gemini speech synthesis succeeded!")
            except QuotaExhausted:
                if settings.GEMINI_TTS_ONLY:
                    raise  # the platform waits for the quota reset
                logger.warning("Every Gemini key has used its daily quota; using a fallback voice")
            except Exception as exc:
                logger.warning("Gemini synthesis attempt encountered error: %s", exc)
            if not wav_bytes and settings.GEMINI_TTS_ONLY:
                raise RuntimeError("Gemini TTS did not return audio")

        # 2. Neural Bengali / English TTS fallback (Edge TTS)
        if not wav_bytes:
            try:
                import asyncio
                logger.info("Synthesizing audio using Neural Bengali TTS pipeline...")
                # Map speaker name to Edge voice if applicable
                edge_voice = None
                if speaker:
                    speaker_lower = speaker.lower()
                    if "pradeep" in speaker_lower:
                        edge_voice = "bn-BD-PradeepNeural"
                    elif "nabanita" in speaker_lower:
                        edge_voice = "bn-BD-NabanitaNeural"
                    elif "tanishaa" in speaker_lower:
                        edge_voice = "bn-IN-TanishaaNeural"
                    elif "guy" in speaker_lower or "aaron" in speaker_lower:
                        edge_voice = "en-US-GuyNeural"
                    elif "jenny" in speaker_lower:
                        edge_voice = "en-US-JennyNeural"

                try:
                    # Run async synthesis in current thread or new event loop
                    loop = asyncio.get_event_loop()
                    if loop.is_running():
                        import concurrent.futures
                        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
                            wav_bytes = pool.submit(
                                lambda: asyncio.run(self._synthesize_edge_tts(text, language, edge_voice))
                            ).result()
                    else:
                        wav_bytes = loop.run_until_complete(self._synthesize_edge_tts(text, language, edge_voice))
                except RuntimeError:
                    wav_bytes = asyncio.run(self._synthesize_edge_tts(text, language, edge_voice))

            except Exception as exc:
                logger.warning("Edge Neural TTS failed: %s; falling back to gTTS...", exc)

        # 3. Google Text-to-Speech (gTTS) fallback
        if not wav_bytes:
            try:
                wav_bytes = self._synthesize_gtts(text=text, language=language)
            except Exception as exc:
                logger.warning("gTTS fallback failed: %s; generating emergency audio...", exc)

        # 4. Every engine failed: surface the error so the platform worker retries
        #    instead of storing silence as if it were narrated audio.
        if not wav_bytes:
            raise RuntimeError("All speech synthesis engines failed for this text")

        # Write WAV to disk
        output_path.write_bytes(wav_bytes)
        logger.info("WAV audio written to %s (%d bytes)", output_path, len(wav_bytes))
        return str(output_path)

    def _generate_silent_wav(self, duration_sec: float = 3.0, sample_rate: int = 24000) -> bytes:
        """Generates a brief silent WAV file as a fail-safe fallback."""
        num_frames = int(sample_rate * duration_sec)
        out = io.BytesIO()
        with wave.open(out, "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(sample_rate)
            wf.writeframes(b"\x00\x00" * num_frames)
        return out.getvalue()

    def get_speakers(self) -> List[Dict[str, str]]:
        """Return available voices across Gemini and Neural Bengali engines."""
        return [
            {"name": "Puck", "gender": "male", "tag": "Gemini Expressive Narrative", "language": "multilingual"},
            {"name": "Charon", "gender": "male", "tag": "Gemini Deep & Authoritative", "language": "multilingual"},
            {"name": "Kore", "gender": "female", "tag": "Gemini Warm & Clear", "language": "multilingual"},
            {"name": "Fenrir", "gender": "male", "tag": "Gemini Bold Storyteller", "language": "multilingual"},
            {"name": "Aoede", "gender": "female", "tag": "Gemini Melodic & Expressive", "language": "multilingual"},
            {"name": "Pradeep", "gender": "male", "tag": "Authentic Bangladeshi Bengali (Male)", "language": "bn"},
            {"name": "Nabanita", "gender": "female", "tag": "Authentic Bangladeshi Bengali (Female)", "language": "bn"},
            {"name": "Tanishaa", "gender": "female", "tag": "Standard Bengali (Female)", "language": "bn"},
            {"name": "Aaron Dreschner", "gender": "male", "tag": "Articulate English (Narrator)", "language": "en"},
        ]


gemini_service = GeminiService()
