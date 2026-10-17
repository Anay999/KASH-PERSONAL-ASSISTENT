"""
Configuration settings for Project JARVIS.
"""
import os
from pathlib import Path
from typing import List
from pydantic import BaseModel, Field

BASE_DIR = Path(__file__).resolve().parent.parent.parent
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)

class Settings(BaseModel):
    # Server settings
    host: str = Field(default=os.getenv("JARVIS_HOST", "127.0.0.1"))
    port: int = Field(default=int(os.getenv("JARVIS_PORT", "8000")))
    cors_origins: List[str] = Field(
        default=["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:8000", "http://127.0.0.1:8000"]
    )

    # Ollama settings
    ollama_host: str = Field(default=os.getenv("OLLAMA_HOST", "http://127.0.0.1:11434"))
    default_model: str = Field(default=os.getenv("JARVIS_MODEL", "qwen2.5:3b"))
    reasoning_model: str = Field(default=os.getenv("JARVIS_REASONING_MODEL", "deepseek-r1:1.5b"))
    temperature: float = Field(default=0.7)

    # Voice settings
    whisper_model_size: str = Field(default=os.getenv("WHISPER_MODEL", "tiny"))
    whisper_device: str = Field(default=os.getenv("WHISPER_DEVICE", "auto"))  # auto, cuda, or cpu
    whisper_compute_type: str = Field(default=os.getenv("WHISPER_COMPUTE", "int8"))
    tts_primary_voice: str = Field(default=os.getenv("TTS_VOICE", "en-GB-RyanNeural"))
    tts_rate: str = Field(default="+0%")
    tts_pitch: str = Field(default="+0Hz")

    # Storage settings
    db_path: str = Field(default=str(DATA_DIR / "jarvis_memory.db"))
    workspace_root: str = Field(default=str(BASE_DIR.parent))

settings = Settings()
