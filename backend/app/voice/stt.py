"""
Robust Speech-to-Text module using faster-whisper.
Supports GPU acceleration on RTX 4050 with automatic CPU fallback.
Performs audio validation, WAV metadata verification, and structured error reporting.
"""
import io
import time
import wave
import logging
import asyncio
from typing import Optional, Tuple, List, Dict, Any
import numpy as np
from faster_whisper import WhisperModel
from ..core.config import settings

logger = logging.getLogger("jarvis.stt")

class SpeechRecognizer:
    def __init__(self):
        self.model: Optional[WhisperModel] = None
        self.device_used: str = "uninitialized"
        self._lock = asyncio.Lock()

    def initialize(self):
        """Initializes the whisper model with GPU acceleration and CPU fallback."""
        if self.model is not None:
            return

        requested_device = settings.whisper_device.lower()
        model_size = settings.whisper_model_size

        if requested_device in ("cuda", "auto"):
            try:
                logger.info(f"Attempting to load faster-whisper '{model_size}' on CUDA (RTX 4050)...")
                test_model = WhisperModel(model_size, device="cuda", compute_type="float16")
                # Run warmup frame to verify cuBLAS DLLs and CUDA runtime actually work
                dummy = np.zeros(1600, dtype=np.float32)
                _ = list(test_model.transcribe(dummy, language="en", vad_filter=False)[0])
                self.model = test_model
                self.device_used = "cuda"
                logger.info("faster-whisper successfully initialized and verified on CUDA (RTX GPU).")
                return
            except Exception as e:
                logger.warning(f"CUDA initialization or cuBLAS validation failed ({e}), falling back to CPU (int8)...")

        try:
            logger.info(f"Loading faster-whisper '{model_size}' on CPU (int8)...")
            self.model = WhisperModel(model_size, device="cpu", compute_type="int8")
            self.device_used = "cpu"
            logger.info("faster-whisper successfully initialized on CPU.")
        except Exception as e:
            logger.error(f"Failed to initialize faster-whisper on CPU: {e}")
            self.device_used = "failed"
            raise e

    def validate_wav_audio(self, audio_bytes: bytes) -> Dict[str, Any]:
        """
        Validates WAV container header and metadata.
        Returns dict with valid=True/False, duration, channels, sample_rate, error.
        """
        if len(audio_bytes) < 44:
            return {"valid": False, "error": f"Audio buffer too small ({len(audio_bytes)} bytes)."}

        if not audio_bytes.startswith(b"RIFF"):
            return {"valid": True, "is_wav": False, "channels": 1, "sample_rate": 16000, "duration": len(audio_bytes) / 32000.0}

        try:
            bio = io.BytesIO(audio_bytes)
            with wave.open(bio, "rb") as wf:
                channels = wf.getnchannels()
                sampwidth = wf.getsampwidth()
                framerate = wf.getframerate()
                nframes = wf.getnframes()
                duration = nframes / float(framerate) if framerate > 0 else 0.0

                if sampwidth != 2:
                    return {"valid": False, "error": f"Unsupported sample width: {sampwidth * 8} bit (expected 16-bit)."}
                if framerate < 8000 or framerate > 96000:
                    return {"valid": False, "error": f"Unsupported sample rate: {framerate} Hz."}

                return {
                    "valid": True,
                    "is_wav": True,
                    "channels": channels,
                    "sample_rate": framerate,
                    "duration": duration,
                    "frames": nframes
                }
        except wave.Error as we:
            return {"valid": False, "error": f"Corrupted WAV container: {str(we)}"}
        except Exception as ex:
            return {"valid": False, "error": f"Audio validation error: {str(ex)}"}

    async def transcribe_audio_buffer(
        self,
        audio_bytes: bytes,
        language: str = "en"
    ) -> Tuple[str, float, Optional[str]]:
        """
        Transcribes raw audio bytes (either WAV or raw 16-bit PCM).
        Returns (transcript_text, average_confidence, error_detail).
        Distinguishes silence (transcript="", error=None) from failures (transcript="", error="...").
        """
        if not audio_bytes or len(audio_bytes) < 160:
            return "", 0.0, "Audio recording is empty."

        # Validate audio metadata
        val_info = self.validate_wav_audio(audio_bytes)
        if not val_info.get("valid", False):
            err = val_info.get("error", "Invalid audio format")
            logger.warning(f"Audio rejection: {err}")
            return "", 0.0, err

        duration = val_info.get("duration", 0.0)
        if duration < 0.2:
            return "", 0.0, "Audio recording too short (< 0.2s)."

        # Ensure model is ready
        if self.model is None:
            await asyncio.to_thread(self.initialize)

        def _do_transcribe() -> Tuple[str, float, Optional[str]]:
            start_t = time.perf_counter()
            try:
                # 1. Unpack clean 16-bit PCM frames into float32 array
                if val_info.get("is_wav", False):
                    bio = io.BytesIO(audio_bytes)
                    with wave.open(bio, "rb") as wf:
                        raw_frames = wf.readframes(wf.getnframes())
                        audio_np = np.frombuffer(raw_frames, dtype=np.int16).astype(np.float32) / 32768.0
                else:
                    audio_np = np.frombuffer(audio_bytes, dtype=np.int16).astype(np.float32) / 32768.0

                if len(audio_np) == 0:
                    return "", 0.0, "Empty audio buffer."

                # 2. Check signal energy and peak amplitude to reject noise/silence early
                rms_energy = float(np.sqrt(np.mean(audio_np ** 2)))
                peak_amp = float(np.max(np.abs(audio_np)))

                logger.info(
                    f"STT: Processing {len(audio_np)} samples ({duration:.2f}s) | "
                    f"Peak: {peak_amp:.3f} | RMS: {rms_energy:.5f}"
                )

                if rms_energy < 0.0015 and peak_amp < 0.006:
                    logger.info("STT: Energy below audible speech threshold. Treating as silence.")
                    return "", 0.0, None

                # 3. Remove DC bias offset
                audio_np = audio_np - np.mean(audio_np)

                # 4. Transcribe with anti-repetition settings and greedy decoding
                segments, info = self.model.transcribe(
                    audio_np,
                    language=language,
                    vad_filter=True,
                    vad_parameters=dict(min_silence_duration_ms=500),
                    beam_size=5,
                    best_of=5,
                    temperature=0.0,
                    repetition_penalty=1.2,
                    no_repeat_ngram_size=3,
                    condition_on_previous_text=False
                )

                text_parts: List[str] = []
                confidences: List[float] = []

                for segment in segments:
                    seg_text = segment.text.strip()
                    if seg_text:
                        text_parts.append(seg_text)
                        confidences.append(segment.avg_logprob)

                elapsed = time.perf_counter() - start_t
                full_text = " ".join(text_parts).strip()
                avg_prob = float(np.exp(np.mean(confidences))) if confidences else 1.0

                logger.info(
                    f"STT completed in {elapsed:.3f}s on {self.device_used.upper()} | "
                    f"Audio duration: {duration:.2f}s | Result: '{full_text}' (conf: {avg_prob:.2f})"
                )
                return full_text, avg_prob, None

            except Exception as ex:
                elapsed = time.perf_counter() - start_t
                if self.device_used == "cuda":
                    logger.warning(f"CUDA transcription failure ({ex}), falling back to CPU (int8)...")
                    try:
                        self.model = WhisperModel(self.model_size, device="cpu", compute_type="int8")
                        self.device_used = "cpu"
                        return _do_transcribe()
                    except Exception as cpu_ex:
                        logger.error(f"CPU fallback also failed: {cpu_ex}")
                        return "", 0.0, f"Transcription failure: {str(cpu_ex)}"

                logger.error(f"STT transcription failed after {elapsed:.3f}s: {ex}")
                return "", 0.0, f"Transcription failure: {str(ex)}"

        async with self._lock:
            return await asyncio.to_thread(_do_transcribe)

    def compute_energy(self, pcm_chunk: bytes) -> float:
        """Calculates Root-Mean-Square (RMS) amplitude to detect silence/speech onset."""
        if not pcm_chunk:
            return 0.0
        try:
            samples = np.frombuffer(pcm_chunk, dtype=np.int16).astype(np.float32)
            if len(samples) == 0:
                return 0.0
            return float(np.sqrt(np.mean(samples ** 2)))
        except Exception:
            return 0.0

recognizer = SpeechRecognizer()
