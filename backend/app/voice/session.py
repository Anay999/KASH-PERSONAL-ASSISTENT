"""
Voice session coordinator for Project JARVIS.
Adapted from provider-neutral voice session architecture:
- Coordinates audio input buffer, STT, AI streaming, tool execution, and British TTS.
- Manages push-to-talk, continuous listening, and instant audio interruptions.
- Strictly enforces state transitions: IDLE -> LISTENING -> THINKING -> SPEAKING -> IDLE.
"""
import json
import base64
import asyncio
import logging
from typing import Optional, Dict, Any, List
from fastapi import WebSocket, WebSocketDisconnect

from ..core.events import SessionEvent, VoiceState
from ..core.config import settings
from .stt import recognizer
from .tts import tts_engine
from ..ai.ollama_client import ollama_client
from ..ai.persona import build_prompt_with_memories, sanitize_ai_response
from ..tools.registry import registry
from ..memory.memory_manager import memory_manager

logger = logging.getLogger("jarvis.session")

class VoiceSession:
    def __init__(self, websocket: WebSocket, conversation_id: Optional[str] = None):
        self.ws = websocket
        self.conversation_id: str = conversation_id or ""
        self.state: str = VoiceState.IDLE
        self.audio_buffer = bytearray()
        self.current_cancel_event: Optional[asyncio.Event] = None
        self.active_ai_task: Optional[asyncio.Task] = None
        self.is_continuous_listening: bool = False
        self._is_processing_audio: bool = False

    async def send_event(self, event: SessionEvent):
        """Sends a JSON event over the WebSocket connection safely."""
        try:
            await self.ws.send_text(event.model_dump_json())
        except Exception as e:
            logger.debug(f"Failed sending event to client: {e}")

    async def set_state(self, new_state: str, detail: Optional[str] = None):
        """Updates internal state and broadcasts state change."""
        self.state = new_state
        logger.info(f"Session State -> {new_state.upper()} ({detail or 'no detail'})")
        await self.send_event(SessionEvent.state_change(new_state, detail))

    def interrupt(self):
        """Instantly halts any active AI generation or TTS synthesis."""
        if self.current_cancel_event and not self.current_cancel_event.is_set():
            self.current_cancel_event.set()
        if self.active_ai_task and not self.active_ai_task.done():
            self.active_ai_task.cancel()
        logger.info("Session work interrupted.")

    async def initialize(self):
        """Sets up conversation in database and sends initial ready state."""
        self.conversation_id = await memory_manager.get_or_create_conversation(self.conversation_id)
        await self.set_state(VoiceState.IDLE, "Systems initialized and standing by.")

    async def handle_audio_chunk(self, chunk_bytes: bytes):
        """Appends incoming microphone audio chunk to the buffer."""
        # Bound maximum buffer size to 8MB (~4 minutes at 16kHz mono) to prevent runaway memory
        if len(self.audio_buffer) < 8 * 1024 * 1024:
            self.audio_buffer.extend(chunk_bytes)

    async def start_recording(self):
        """Client notified recording start."""
        self.interrupt()
        self.audio_buffer.clear()
        self._is_processing_audio = False
        logger.info("Session: Recording started, audio buffer cleared.")
        await self.set_state(VoiceState.LISTENING, "Listening for speech...")

    async def process_accumulated_audio(self):
        """
        Transcribes the accumulated audio buffer and processes the utterance.
        Guarantees that state transitions out of LISTENING under every circumstance.
        """
        if self._is_processing_audio:
            logger.warning("Audio processing already in flight, ignoring duplicate trigger.")
            return

        self._is_processing_audio = True

        try:
            # Check minimum size (44 byte WAV header + at least 1600 bytes audio)
            if len(self.audio_buffer) < 1644:
                logger.info(f"Audio buffer too small ({len(self.audio_buffer)} bytes). Returning to IDLE.")
                self.audio_buffer.clear()
                await self.send_event(SessionEvent.transcript_empty("Audio recording was too short."))
                await self.set_state(VoiceState.IDLE, "Recording too short.")
                return

            audio_data = bytes(self.audio_buffer)
            self.audio_buffer.clear()

            await self.set_state(VoiceState.THINKING, "Transcribing speech...")
            transcript, confidence, error = await recognizer.transcribe_audio_buffer(audio_data)

            if error:
                if "too short" in error.lower() or "empty" in error.lower():
                    logger.info(f"STT short/empty recording: {error}")
                    await self.send_event(SessionEvent.transcript_empty(error))
                    await self.set_state(VoiceState.IDLE, error)
                    return
                logger.warning(f"STT diagnostic: {error}")
                await self.send_event(SessionEvent.error(error, code="STT_ERROR"))
                await self.set_state(VoiceState.ERROR, error)
                await asyncio.sleep(1.0)
                await self.set_state(VoiceState.IDLE)
                return

            if not transcript or not transcript.strip():
                logger.info("STT returned empty transcript (silence).")
                await self.send_event(SessionEvent.transcript_empty("No intelligible speech detected."))
                await self.set_state(VoiceState.IDLE, "No speech detected.")
                return

            clean_text = transcript.strip()
            logger.info(f"User Spoken Utterance: '{clean_text}' (Confidence: {confidence:.2f})")
            await self.send_event(SessionEvent.transcript_final(clean_text, confidence=confidence))

            # Hand off to AI conversation pipeline
            await self.process_user_message(clean_text)

        finally:
            self._is_processing_audio = False

    async def process_user_message(self, user_text: str):
        """
        Processes a user query (spoken or typed):
        1. Saves message to SQLite conversation history.
        2. Retrieves persistent memories.
        3. Streams AI tokens from Ollama.
        4. Handles tool calls if requested.
        5. Streams British TTS audio chunks.
        """
        self.interrupt()  # Stop any prior speech/generation
        self.current_cancel_event = asyncio.Event()

        # Save user message to database
        await memory_manager.add_message(self.conversation_id, "user", user_text)

        # Retrieve conversation context and memories
        history = await memory_manager.get_conversation_history(self.conversation_id, limit=12)
        memories = await memory_manager.get_all_memories()

        # Build message payload with Vision persona
        system_instruction = build_prompt_with_memories(memories)
        messages_payload: List[Dict[str, str]] = [
            {"role": "system", "content": system_instruction}
        ]
        for m in history:
            messages_payload.append({
                "role": m["role"],
                "content": m["content"]
            })

        # Ensure the conversation payload always concludes with the user turn
        if not messages_payload or messages_payload[-1].get("role") != "user":
            messages_payload.append({"role": "user", "content": user_text})

        await self.set_state(VoiceState.THINKING, "Formulating response...")
        tool_schemas = registry.get_ollama_tools()

        # Launch streaming generation task
        self.active_ai_task = asyncio.create_task(
            self._stream_ai_and_speech(messages_payload, tool_schemas)
        )

    async def _stream_ai_and_speech(
        self,
        messages_payload: List[Dict[str, str]],
        tool_schemas: List[Dict[str, Any]]
    ):
        cancel_event = self.current_cancel_event
        full_ai_response = ""
        pending_tool_calls = []

        try:
            # Stream tokens from Ollama
            async for chunk in ollama_client.stream_chat(
                messages=messages_payload,
                tools=tool_schemas
            ):
                if cancel_event and cancel_event.is_set():
                    break

                chunk_type = chunk.get("type")
                if chunk_type == "token":
                    token = chunk.get("content", "")
                    full_ai_response += token
                    await self.send_event(SessionEvent.ai_token(token))

                elif chunk_type == "tool_calls":
                    pending_tool_calls.extend(chunk.get("calls", []))

                elif chunk_type == "error":
                    err_msg = chunk.get("message", "Unknown inference error.")
                    await self.send_event(SessionEvent.error(err_msg))
                    await self.set_state(VoiceState.ERROR, err_msg)
                    return

            if cancel_event and cancel_event.is_set():
                await self.set_state(VoiceState.IDLE)
                return

            # Execute pending tools if any
            if pending_tool_calls:
                for call in pending_tool_calls:
                    fn = call.get("function", {})
                    fn_name = fn.get("name")
                    fn_args = fn.get("arguments", {})
                    if isinstance(fn_args, str):
                        try:
                            fn_args = json.loads(fn_args)
                        except json.JSONDecodeError:
                            fn_args = {}

                    call_id = call.get("id", fn_name)
                    await self.send_event(SessionEvent.tool_call(fn_name, fn_args, call_id))
                    await self.set_state(VoiceState.THINKING, f"Executing tool: {fn_name}")

                    tool_output = await registry.dispatch(fn_name, fn_args)
                    await self.send_event(SessionEvent.tool_result(fn_name, tool_output))

                    # Append tool result into context and query Ollama for final explanation
                    messages_payload.append({
                        "role": "assistant",
                        "content": full_ai_response or f"I will now execute {fn_name}."
                    })
                    messages_payload.append({
                        "role": "tool",
                        "content": json.dumps(tool_output)
                    })

                    # Second stream pass to explain results in British persona
                    full_ai_response = ""
                    async for follow_chunk in ollama_client.stream_chat(messages=messages_payload):
                        if cancel_event and cancel_event.is_set():
                            break
                        if follow_chunk.get("type") == "token":
                            tok = follow_chunk.get("content", "")
                            full_ai_response += tok
                            await self.send_event(SessionEvent.ai_token(tok))

            # Sanitize and finalize text
            clean_response = sanitize_ai_response(full_ai_response)
            await self.send_event(SessionEvent.ai_complete(clean_response))
            if clean_response:
                await memory_manager.add_message(self.conversation_id, "assistant", clean_response)

            # Generate and stream TTS audio
            audio_count = 0
            if clean_response and not (cancel_event and cancel_event.is_set()):
                await self.set_state(VoiceState.SPEAKING, "Synthesizing voice response...")
                async for audio_b64, mime, seq in tts_engine.stream_speech_chunks(clean_response, cancel_event):
                    if cancel_event and cancel_event.is_set():
                        break
                    audio_count += 1
                    await self.send_event(SessionEvent.audio_chunk(audio_b64, mime, seq))

            # Notify client that server audio generation is complete
            await self.send_event(SessionEvent.audio_complete(total_chunks=audio_count))

            # If no audio was generated, return to IDLE immediately; otherwise frontend will manage playback completion
            if audio_count == 0:
                await self.set_state(VoiceState.IDLE)

        except asyncio.CancelledError:
            logger.info("AI streaming task cancelled.")
            await self.set_state(VoiceState.IDLE)
        except Exception as e:
            logger.error(f"Error in session streaming: {e}")
            await self.send_event(SessionEvent.error(str(e)))
            await self.set_state(VoiceState.ERROR, str(e))
