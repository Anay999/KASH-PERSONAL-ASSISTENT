"""
Text-to-Speech synthesis pipeline for Project JARVIS.
Primary: Edge TTS (en-GB-RyanNeural - Refined British delivery).
Fallback: pyttsx3 (Local offline SAPI5 speech synthesis).
Supports sentence streaming, audio queuing, and instant interruption.
"""
import re
import os
import base64
import asyncio
import logging
import tempfile
from typing import AsyncGenerator, Optional, Tuple, List
import edge_tts
from ..core.config import settings

logger = logging.getLogger("jarvis.tts")

# Sentence boundary regex for chunked speech delivery
SENTENCE_SPLIT_REGEX = re.compile(r'(?<=[.!?])\s+')

class TextToSpeechEngine:
    def __init__(self):
        self.primary_voice = settings.tts_primary_voice
        self.rate = settings.tts_rate
        self.pitch = settings.tts_pitch
        self._offline_engine = None
        self.active_provider = "edge-tts"
        self._pyttsx3_lock = asyncio.Lock()

    def _get_offline_engine(self):
        """Initializes pyttsx3 offline engine lazily."""
        if self._offline_engine is None:
            import pyttsx3
            self._offline_engine = pyttsx3.init()
            self._offline_engine.setProperty('rate', 170)
            voices = self._offline_engine.getProperty('voices')
            # Prefer a British voice if installed, otherwise keep default
            for v in voices:
                if "british" in v.name.lower() or "en-gb" in v.id.lower() or "george" in v.name.lower() or "hazel" in v.name.lower():
                    self._offline_engine.setProperty('voice', v.id)
                    break
        return self._offline_engine

    async def synthesize_edge(self, text: str) -> bytes:
        """Synthesizes text using Microsoft Edge TTS (en-GB-RyanNeural)."""
        communicate = edge_tts.Communicate(
            text=text,
            voice=self.primary_voice,
            rate=self.rate,
            pitch=self.pitch
        )
        audio_chunks: List[bytes] = []
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio_chunks.append(chunk["data"])
        return b"".join(audio_chunks)

    async def synthesize_offline(self, text: str) -> bytes:
        """Synthesizes text using pyttsx3 offline engine to WAV bytes."""
        def _render() -> bytes:
            engine = self._get_offline_engine()
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tf:
                tmp_path = tf.name
            try:
                engine.save_to_file(text, tmp_path)
                engine.runAndWait()
                with open(tmp_path, "rb") as f:
                    data = f.read()
                return data
            finally:
                if os.path.exists(tmp_path):
                    try:
                        os.remove(tmp_path)
                    except OSError:
                        pass

        async with self._pyttsx3_lock:
            return await asyncio.to_thread(_render)

    async def stream_speech_chunks(
        self,
        text: str,
        cancel_event: Optional[asyncio.Event] = None
    ) -> AsyncGenerator[Tuple[str, str, int], None]:
        """
        Splits text into sentences, synthesizes each sentence sequentially,
        and yields (audio_b64, mime_type, sequence_id).
        Checks cancel_event before and during synthesis for instant interruption.
        """
        cleaned_text = text.strip()
        if not cleaned_text:
            return

        sentences = [s.strip() for s in SENTENCE_SPLIT_REGEX.split(cleaned_text) if s.strip()]
        if not sentences:
            sentences = [cleaned_text]

        for seq, sentence in enumerate(sentences):
            if cancel_event and cancel_event.is_set():
                logger.info("Speech generation interrupted by user.")
                break

            # Try primary Edge TTS first
            audio_bytes = b""
            mime_type = "audio/mp3"

            try:
                audio_bytes = await self.synthesize_edge(sentence)
                self.active_provider = "edge-tts"
            except Exception as edge_err:
                logger.warning(f"Edge TTS synthesis error ({edge_err}), switching to offline pyttsx3 fallback.")
                try:
                    audio_bytes = await self.synthesize_offline(sentence)
                    mime_type = "audio/wav"
                    self.active_provider = "pyttsx3"
                except Exception as offline_err:
                    logger.error(f"Both Edge TTS and offline fallback failed: {offline_err}")
                    continue

            if cancel_event and cancel_event.is_set():
                break

            if audio_bytes:
                audio_b64 = base64.b64encode(audio_bytes).decode("ascii")
                yield audio_b64, mime_type, seq

tts_engine = TextToSpeechEngine()
