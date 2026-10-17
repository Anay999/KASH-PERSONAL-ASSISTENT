"""
Automated unit tests for Project JARVIS.
Validates persona sanitization, tool dispatching, persistent memory,
audio validation, WAV metadata verification, and voice session events.
"""
import sys
import io
import wave
import numpy as np
from pathlib import Path
import pytest
import asyncio

# Ensure backend directory is in path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.tools.registry import registry
from app.tools.system_tools import get_current_time, get_system_status, launch_application, read_workspace_file
from app.memory.memory_manager import memory_manager
from app.memory.database import init_db
from app.ai.persona import sanitize_ai_response, build_prompt_with_memories
from app.voice.tts import tts_engine
from app.voice.stt import recognizer
from app.core.events import SessionEvent, VoiceState

def test_persona_sanitization():
    raw_with_think = "<think>Analyzing user request about quantum computing...</think>Good evening, sir. Quantum computing leverages superposition and entanglement."
    cleaned = sanitize_ai_response(raw_with_think)
    assert "<think>" not in cleaned
    assert "</think>" not in cleaned
    assert "Analyzing user request" not in cleaned
    assert "Good evening, sir." in cleaned

    unclosed_think = "<think>Calculating mathematical proofs... In progress"
    cleaned_unclosed = sanitize_ai_response(unclosed_think)
    assert cleaned_unclosed == ""

def test_build_prompt_with_memories():
    mems = [{"category": "preference", "key": "tone", "value": "philosophical"}]
    prompt = build_prompt_with_memories(mems)
    assert "philosophical" in prompt
    assert "JARVIS" in prompt

def test_tool_registry_schemas():
    tools = registry.get_ollama_tools()
    names = [t["function"]["name"] for t in tools]
    assert "get_current_time" in names
    assert "get_system_status" in names
    assert "launch_application" in names
    assert "read_workspace_file" in names

@pytest.mark.asyncio
async def test_tool_execution():
    time_res = await registry.dispatch("get_current_time", {})
    assert time_res["status"] == "success"
    assert "time" in time_res

    status_res = await registry.dispatch("get_system_status", {})
    assert status_res["status"] == "success"
    assert "cpu" in status_res

    # Security test: ensure arbitrary command execution is rejected
    attack_res = await registry.dispatch("launch_application", {"app_name": "malicious_script.bat"})
    assert attack_res["status"] == "rejected"
    assert "not in the approved security allowlist" in attack_res["error"]

    # Sandboxing test: ensure path traversal is blocked
    traversal_res = await registry.dispatch("read_workspace_file", {"relative_path": "../../Windows/System32/drivers/etc/hosts"})
    assert traversal_res["status"] == "forbidden"

@pytest.mark.asyncio
async def test_memory_crud():
    await init_db()
    conv_id = await memory_manager.get_or_create_conversation()
    assert conv_id is not None

    await memory_manager.add_message(conv_id, "user", "What is my project goal?")
    await memory_manager.add_message(conv_id, "assistant", "Your goal is to build an intelligent assistant.")

    history = await memory_manager.get_conversation_history(conv_id)
    assert len(history) == 2
    assert history[0]["content"] == "What is my project goal?"

    # Persistent memories
    saved = await memory_manager.save_memory("favorite_tea", "Earl Grey", "preference")
    assert saved["key"] == "favorite_tea"

    all_mems = await memory_manager.get_all_memories()
    assert any(m["key"] == "favorite_tea" and m["value"] == "Earl Grey" for m in all_mems)

@pytest.mark.asyncio
async def test_tts_offline_synthesis():
    # Test pyttsx3 offline fallback audio generation
    audio_bytes = await tts_engine.synthesize_offline("Systems operational, sir.")
    assert len(audio_bytes) > 1000
    assert audio_bytes.startswith(b"RIFF")  # Valid WAV header

def test_wav_validation():
    # 1. Valid 16kHz WAV
    bio = io.BytesIO()
    with wave.open(bio, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(16000)
        wf.writeframes(np.zeros(16000, dtype=np.int16).tobytes())
    valid_wav = bio.getvalue()

    res = recognizer.validate_wav_audio(valid_wav)
    assert res["valid"] is True
    assert res["channels"] == 1
    assert res["sample_rate"] == 16000
    assert abs(res["duration"] - 1.0) < 0.05

    # 2. Corrupted header
    bad_bytes = b"RIFF" + b"\x00" * 30
    bad_res = recognizer.validate_wav_audio(bad_bytes)
    assert bad_res["valid"] is False

    # 3. Too small buffer
    tiny_bytes = b"RIFF123"
    tiny_res = recognizer.validate_wav_audio(tiny_bytes)
    assert tiny_res["valid"] is False

@pytest.mark.asyncio
async def test_short_audio_rejection():
    # 0.05s audio at 16kHz (800 samples = 1600 bytes)
    bio = io.BytesIO()
    with wave.open(bio, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(16000)
        wf.writeframes(np.zeros(800, dtype=np.int16).tobytes())
    short_wav = bio.getvalue()

    transcript, conf, err = await recognizer.transcribe_audio_buffer(short_wav)
    assert transcript == ""
    assert err is not None
    assert "too short" in err.lower()

def test_session_events():
    evt_empty = SessionEvent.transcript_empty("Silence detected")
    assert evt_empty.type == "transcript.empty"
    assert evt_empty.payload["message"] == "Silence detected"

    evt_complete = SessionEvent.audio_complete(total_chunks=3)
    assert evt_complete.type == "audio.complete"
    assert evt_complete.payload["total_chunks"] == 3

    evt_state = SessionEvent.state_change(VoiceState.SPEAKING, "Playing audio")
    assert evt_state.type == "session.state"
    assert evt_state.payload["state"] == "speaking"

if __name__ == "__main__":
    test_persona_sanitization()
    test_build_prompt_with_memories()
    test_tool_registry_schemas()
    test_wav_validation()
    test_session_events()
    asyncio.run(test_memory_crud())
    asyncio.run(test_tool_execution())
    asyncio.run(test_tts_offline_synthesis())
    asyncio.run(test_short_audio_rejection())
    print("All backend automated unit tests passed successfully!")
