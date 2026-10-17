"""
Event specifications and serialization models for Project JARVIS.
Adapted from provider-neutral voice interaction state machine.
"""
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field

class VoiceState:
    IDLE = "idle"
    LISTENING = "listening"
    THINKING = "thinking"
    SPEAKING = "speaking"
    INTERRUPTED = "interrupted"
    ERROR = "error"

class SessionEvent(BaseModel):
    type: str
    payload: Dict[str, Any] = Field(default_factory=dict)

    @classmethod
    def state_change(cls, state: str, detail: Optional[str] = None) -> "SessionEvent":
        return cls(type="session.state", payload={"state": state, "detail": detail})

    @classmethod
    def transcript_partial(cls, text: str) -> "SessionEvent":
        return cls(type="transcript.partial", payload={"text": text})

    @classmethod
    def transcript_final(cls, text: str, confidence: float = 1.0) -> "SessionEvent":
        return cls(type="transcript.final", payload={"text": text, "confidence": confidence})

    @classmethod
    def transcript_empty(cls, message: str = "No intelligible speech detected.") -> "SessionEvent":
        return cls(type="transcript.empty", payload={"message": message})

    @classmethod
    def ai_token(cls, token: str) -> "SessionEvent":
        return cls(type="ai.token", payload={"token": token})

    @classmethod
    def ai_complete(cls, text: str, latency_ms: Optional[float] = None) -> "SessionEvent":
        return cls(type="ai.complete", payload={"text": text, "latency_ms": latency_ms})

    @classmethod
    def tool_call(cls, name: str, args: Dict[str, Any], call_id: str) -> "SessionEvent":
        return cls(type="tool.call", payload={"name": name, "args": args, "call_id": call_id})

    @classmethod
    def tool_result(cls, name: str, result: Any, status: str = "success") -> "SessionEvent":
        return cls(type="tool.result", payload={"name": name, "result": result, "status": status})

    @classmethod
    def audio_chunk(cls, audio_b64: str, mime: str = "audio/mp3", sequence: int = 0) -> "SessionEvent":
        return cls(type="audio.chunk", payload={"audio": audio_b64, "mime": mime, "seq": sequence})

    @classmethod
    def audio_complete(cls, total_chunks: int = 0) -> "SessionEvent":
        return cls(type="audio.complete", payload={"total_chunks": total_chunks})

    @classmethod
    def audio_interrupt(cls) -> "SessionEvent":
        return cls(type="audio.interrupt", payload={})

    @classmethod
    def error(cls, message: str, code: str = "GENERIC_ERROR") -> "SessionEvent":
        return cls(type="error", payload={"message": message, "code": code})
