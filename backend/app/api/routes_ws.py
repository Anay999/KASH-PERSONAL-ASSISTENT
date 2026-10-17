"""
WebSocket route for real-time bidirectional streaming communication.
Handles live microphone audio streaming, text fallback, and interrupt control.
"""
import json
import base64
import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from ..voice.session import VoiceSession
from ..core.events import VoiceState

logger = logging.getLogger("jarvis.ws")
router = APIRouter(tags=["websocket"])

@router.websocket("/ws/session")
async def websocket_session_endpoint(websocket: WebSocket):
    await websocket.accept()
    session = VoiceSession(websocket)
    await session.initialize()
    logger.info("New WebSocket voice session established.")

    try:
        while True:
            message = await websocket.receive()

            # Handle binary audio frame (raw PCM or WAV from audioRecorder)
            if "bytes" in message and message["bytes"]:
                await session.handle_audio_chunk(message["bytes"])
                continue

            # Handle text JSON frames
            if "text" in message and message["text"]:
                try:
                    payload = json.loads(message["text"])
                except json.JSONDecodeError:
                    continue

                msg_type = payload.get("type")

                # Microphone started recording
                if msg_type == "audio.start":
                    await session.start_recording()

                # Base64-encoded audio chunk alternative
                elif msg_type == "audio.chunk":
                    raw_b64 = payload.get("data", "")
                    if raw_b64:
                        chunk_bytes = base64.b64decode(raw_b64)
                        await session.handle_audio_chunk(chunk_bytes)

                # Microphone stopped recording -> Trigger STT & AI pipeline
                elif msg_type == "audio.end":
                    await session.process_accumulated_audio()

                # Client finished playing all synthesized audio chunks
                elif msg_type == "playback.complete":
                    logger.info("Client confirmed audio playback complete.")
                    if session.state == VoiceState.SPEAKING:
                        await session.set_state(VoiceState.IDLE)

                # User typed message (Text query fallback)
                elif msg_type == "user.message":
                    text = payload.get("text", "").strip()
                    if text:
                        await session.process_user_message(text)

                # Instant interrupt (Stop Speaking button or user interruption)
                elif msg_type == "audio.interrupt":
                    session.interrupt()
                    await session.set_state(VoiceState.IDLE, "Interrupted by user.")

                # Session configuration update
                elif msg_type == "session.config":
                    if "conversation_id" in payload:
                        session.conversation_id = payload["conversation_id"]
                    if "continuous" in payload:
                        session.is_continuous_listening = bool(payload["continuous"])

    except WebSocketDisconnect:
        session.interrupt()
        logger.info("WebSocket voice session disconnected.")
    except Exception as e:
        session.interrupt()
        logger.error(f"WebSocket session error: {e}")
