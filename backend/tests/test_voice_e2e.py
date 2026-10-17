import asyncio
import websockets
import json
import io
import wave
import numpy as np

async def run_voice_pipeline_tests():
    uri = "ws://127.0.0.1:8000/ws/session"
    print(f"[TEST] Connecting to {uri}...")
    
    async with websockets.connect(uri) as ws:
        # 1. Initial State
        msg = await ws.recv()
        data = json.loads(msg)
        assert data["type"] == "session.state"
        assert data["payload"]["state"] == "idle"
        print("[TEST PASS 1] Initial state verified: IDLE")

        # 2. Test Short Audio Trap (< 0.2s)
        print("\n[TEST] Testing short audio trap handling...")
        await ws.send(json.dumps({"type": "audio.start"}))
        st = json.loads(await ws.recv())
        assert st["type"] == "session.state" and st["payload"]["state"] == "listening"
        
        # Send tiny 0.05s WAV
        bio = io.BytesIO()
        with wave.open(bio, "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(16000)
            wf.writeframes(np.zeros(800, dtype=np.int16).tobytes())
        await ws.send(bio.getvalue())
        await ws.send(json.dumps({"type": "audio.end"}))
        
        # Expect session.state(thinking) -> transcript.empty -> session.state(idle)
        thinking_evt = json.loads(await ws.recv())
        assert thinking_evt["type"] == "session.state" and thinking_evt["payload"]["state"] == "thinking"
        
        evt = json.loads(await ws.recv())
        assert evt["type"] == "transcript.empty"
        print("[TEST PASS 2] Short audio correctly received 'transcript.empty':", evt["payload"])
        
        state_evt = json.loads(await ws.recv())
        assert state_evt["type"] == "session.state" and state_evt["payload"]["state"] == "idle"
        print("[TEST PASS 3] Session cleanly returned to IDLE after short audio.")

        # 3. Test Full Voice-to-Voice Loop with Spoken WAV
        print("\n[TEST] Generating spoken test audio via TTS fallback...")
        # Use pyttsx3 to generate real speech audio for faster-whisper to transcribe!
        from app.voice.tts import tts_engine
        speech_wav = await tts_engine.synthesize_offline("Hello JARVIS, what is your operational status?")
        print(f"[TEST] Generated speech WAV: {len(speech_wav)} bytes")

        print("[TEST] Emitting audio.start -> Binary WAV -> audio.end...")
        await ws.send(json.dumps({"type": "audio.start"}))
        st = json.loads(await ws.recv())
        assert st["type"] == "session.state" and st["payload"]["state"] == "listening"

        await ws.send(speech_wav)
        await ws.send(json.dumps({"type": "audio.end"}))

        # Track received events
        transcript_received = None
        ai_tokens = []
        ai_complete_text = None
        audio_chunks_received = 0
        audio_complete_received = False

        while True:
            raw = await ws.recv()
            evt = json.loads(raw)
            etype = evt.get("type")
            epayload = evt.get("payload", {})

            if etype == "session.state":
                print(f"  [Server State]: {epayload.get('state')} ({epayload.get('detail')})")
            elif etype == "transcript.final":
                transcript_received = epayload.get("text")
                print(f"  [TRANSCRIPTION RECEIVED]: '{transcript_received}' (conf: {epayload.get('confidence')})")
            elif etype == "ai.token":
                tok = epayload.get("token", "")
                ai_tokens.append(tok)
                print(tok, end="", flush=True)
            elif etype == "ai.complete":
                ai_complete_text = epayload.get("text")
                print(f"\n  [AI COMPLETE EVENT]: {len(ai_complete_text)} chars")
            elif etype == "audio.chunk":
                audio_chunks_received += 1
            elif etype == "audio.complete":
                audio_complete_received = True
                print(f"  [AUDIO COMPLETE EVENT]: Total chunks received = {epayload.get('total_chunks')}")
                break
            elif etype == "error":
                print(f"  [UNEXPECTED ERROR]: {epayload}")
                break

        assert transcript_received is not None and len(transcript_received) > 0
        assert len(ai_tokens) > 0
        assert audio_chunks_received > 0
        assert audio_complete_received is True
        print(f"[TEST PASS 4] Full voice pipeline verified: STT -> AI -> {audio_chunks_received} TTS audio chunks received!")

        # 4. Test Playback Complete Handshake
        await ws.send(json.dumps({"type": "playback.complete"}))
        final_state = json.loads(await ws.recv())
        assert final_state["type"] == "session.state" and final_state["payload"]["state"] == "idle"
        print("[TEST PASS 5] Playback complete handshake transitioned session to IDLE.")

        # 5. Test Repeated Question (Verifying Deduplication Bug Fix)
        print("\n[TEST] Testing repeated question (verifying deduplication bug fix)...")
        await ws.send(json.dumps({"type": "audio.start"}))
        st = json.loads(await ws.recv())
        await ws.send(speech_wav)
        await ws.send(json.dumps({"type": "audio.end"}))

        repeated_transcript = None
        while True:
            raw = await ws.recv()
            evt = json.loads(raw)
            if evt.get("type") == "transcript.final":
                repeated_transcript = evt.get("payload", {}).get("text")
                break
            elif evt.get("type") == "transcript.empty":
                break

        assert repeated_transcript == transcript_received
        print(f"[TEST PASS 6] Repeated query successfully transcribed without being suppressed: '{repeated_transcript}'")

        # Interrupt to close clean
        await ws.send(json.dumps({"type": "audio.interrupt"}))
        print("\n=== ALL 6 END-TO-END VOICE PIPELINE INTEGRATION TESTS PASSED! ===")

if __name__ == "__main__":
    import sys
    sys.path.insert(0, "backend")
    asyncio.run(run_voice_pipeline_tests())
