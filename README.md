# PROJECT JARVIS — Personal AI Voice Assistant

A complete, locally operated personal AI voice assistant built from the ground up for Windows 11. Inspired by Marvel's Vision in personality, articulation, and calm British delivery.

Designed specifically for an **NVIDIA GeForce RTX 4050 (6 GB VRAM)**, **16 GB RAM**, and **local Ollama inference**.

---

## 1. System Architecture

```
[ Microphone Input ] ────► [ faster-whisper (STT) ] 
                                  │ (CUDA / CPU Fallback)
                                  ▼
[ SQLite Memory Vault ] ──► [ Ollama Engine ] (qwen2.5:3b)
                                  │ (Vision Persona + Safe Tools)
                                  ▼
[ 3D Neural Sphere ] ◄─── [ British Voice Pipeline ]
(Audio-Reactive WebGL)      ├── Primary: Edge TTS (en-GB-RyanNeural)
                            └── Offline Fallback: pyttsx3 (SAPI5)
```

- **Inference**: Local Ollama LLM (`qwen2.5:3b` default, `deepseek-r1:1.5b` optional reasoning).
- **Speech-to-Text**: `faster-whisper` running with CUDA acceleration on RTX 4050 (automatic CPU `int8` fallback).
- **Text-to-Speech**:
  - **Primary**: Microsoft Edge TTS using `en-GB-RyanNeural` (Refined British English delivery).
  - **Offline Fallback**: `pyttsx3` with local Windows SAPI5 voices for full offline resilience.
- **Backend**: FastAPI + WebSockets for streaming bidirectional communication.
- **Frontend**: React + Vite + Vanilla CSS dark cinematic command center with 3D audio-reactive neural sphere.
- **Memory**: Persistent SQLite database storing multi-turn conversations and user-approved persistent memories.
- **Safety**: Sandboxed tool registry strictly rejecting arbitrary shell commands and directory traversals.

---

## 2. Assistant Identity: Vision Persona

Inspired by the broad personality characteristics of Marvel's Vision:
- **Refined British English**: Articulate, calm, thoughtful, and measured cadence.
- **Quiet Confidence**: Intellectually poised with courteous, subtle dry wit where appropriate.
- **Concise Clarity**: Answers questions directly without conversational filler.
- **Hidden Reasoning Filter**: Internal chain-of-thought tokens (e.g. `<think>...</think>` from reasoning models) are automatically stripped before presentation and voice synthesis.
- **Direct Dialogue**: Answers spoken inquiries naturally rather than behaving as a rigid command parser.

---

## 3. Safe Modular Tool Registry

Inspired by declarative schema dispatch:
1. `get_current_time`: Returns day, date, time, and timezone in elegant British formatting.
2. `get_system_status`: Queries live CPU usage, RAM utilization, GPU (RTX 4050) VRAM, and disk metrics.
3. `launch_application`: Strictly allowlisted Windows applications (`notepad`, `calc`, `explorer`, `taskmgr`, `code`, `cmd`, `edge`). Arbitrary executable names are rejected.
4. `read_workspace_file`: Reads files strictly confined to the project directory, blocking path traversal attacks.
5. `save_persistent_memory`: Stores user facts or preferences into SQLite for future recall.
6. `recall_memories`: Searches stored memories by keyword.

---

## 4. Hardware & Dependency Verification

| Component | Status | Details |
| :--- | :--- | :--- |
| **GPU** | Verified | NVIDIA GeForce RTX 4050 Laptop GPU (6141 MiB VRAM), CUDA 13.3 compute capability 8.9 |
| **Ollama** | Verified | Running locally on `http://127.0.0.1:11434`; `qwen2.5:3b` and `deepseek-r1:1.5b` installed |
| **faster-whisper** | Verified | Loads on CUDA with float16; tested and confirmed on CPU with int8 fallback |
| **Edge TTS** | Verified | `en-GB-RyanNeural` tested and generating audio chunks with `edge-tts` 7.3.1 |
| **pyttsx3 Offline** | Verified | Offline SAPI5 synthesis tested generating valid in-memory WAV byte streams |
| **Frontend Build** | Verified | Vite production build transformed 1932 modules and built in 556ms with 0 errors |
| **Automated Tests** | Passed | Unit tests in `backend/tests/test_backend.py` passed with 100% success |

---

## 5. Quick Start Guide

### Prerequisites
- Windows 11
- Python 3.11 or 3.12 (64-bit)
- Node.js (v18+)
- [Ollama for Windows](https://ollama.com/)

### 1. Download Model in Ollama
If not already installed:
```powershell
ollama pull qwen2.5:3b
```

### 2. Launch Project JARVIS
Run the master PowerShell launcher from the workspace root:
```powershell
.\start-jarvis.ps1
```
This script will:
1. Verify Python, Node.js, and Ollama.
2. Automatically start the Ollama service if offline.
3. Launch the FastAPI backend on `http://127.0.0.1:8000`.
4. Launch the Vite frontend on `http://localhost:5173`.
5. Open your default web browser to the Command Center.

### Manual Launch (Alternative)
**Backend:**
```powershell
cd backend
py -3.11 run.py
```

**Frontend:**
```powershell
cd frontend
npm run dev
```

---

## 6. Project Structure

```
project-jarvis/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI server & lifecycle
│   │   ├── core/
│   │   │   ├── config.py        # Settings & environment
│   │   │   └── events.py        # Typed WebSocket events
│   │   ├── ai/
│   │   │   ├── ollama_client.py # Streaming Ollama client
│   │   │   └── persona.py       # Vision persona & <think> sanitizer
│   │   ├── voice/
│   │   │   ├── stt.py           # faster-whisper with CUDA/CPU fallback
│   │   │   ├── tts.py           # Dual-engine British TTS & interruption
│   │   │   └── session.py       # Voice session coordinator
│   │   ├── tools/
│   │   │   ├── registry.py      # Declarative tool schema registry
│   │   │   └── system_tools.py  # Safe system & memory tools
│   │   ├── memory/
│   │   │   ├── database.py      # SQLite schema initializer
│   │   │   └── memory_manager.py# Conversation history & memory CRUD
│   │   └── api/
│   │       ├── routes_chat.py   # REST API endpoints & fallback
│   │       └── routes_ws.py     # WebSocket bidirectional gateway
│   ├── tests/
│   │   └── test_backend.py      # Automated test suite
│   ├── data/                    # SQLite database storage
│   ├── requirements.txt         # Pinned Python dependencies
│   └── run.py                   # Server runner script
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── NeuralSphere.jsx      # 3D audio-reactive particle sphere
│   │   │   ├── VoiceCardControls.jsx # Push-to-Talk & interrupt bar
│   │   │   ├── LiveTranscriptCard.jsx# Interim & final speech banner
│   │   │   ├── ConversationPanel.jsx # Cinematic chat & tool cards
│   │   │   ├── SystemTelemetry.jsx   # Top HUD status bar
│   │   │   ├── TextInputBar.jsx      # Text query fallback bar
│   │   │   └── MemoryDrawer.jsx      # SQLite memory vault drawer
│   │   ├── services/
│   │   │   ├── audioPlayer.js   # Web Audio API queue with interruption
│   │   │   ├── audioRecorder.js # 16kHz WAV microphone capture
│   │   │   └── websocket.js     # Gateway client with auto-reconnect
│   │   ├── styles/
│   │   │   └── jarvis.css       # Obsidian & gold command center styling
│   │   ├── App.jsx              # Main React application
│   │   └── main.jsx
│   ├── package.json
│   └── vite.config.js           # Reverse proxy configuration
├── start-jarvis.ps1             # Master Windows 11 launcher
├── .env.example                 # Configuration template
├── .gitignore
└── README.md
```

---

## 7. Cost, Privacy, & Limitations

1. **Local Privacy First**:
   - All AI inference runs locally through Ollama on your RTX 4050 GPU. No prompt data or conversations are sent to external cloud LLM providers.
   - Microphone audio is processed entirely on-device by `faster-whisper`.
2. **TTS Disclosure**:
   - The primary British voice (`en-GB-RyanNeural`) uses Microsoft Edge's read-aloud service over HTTPS/WSS, requiring an active internet connection.
   - When offline or if Edge TTS is inaccessible, JARVIS automatically engages `pyttsx3`, ensuring continuous speech without network access.
3. **VRAM Constraints (6 GB RTX 4050)**:
   - `qwen2.5:3b` utilizes approximately 1.9 GB of VRAM.
   - `faster-whisper` (tiny) utilizes approximately 400 MB of VRAM.
   - This leaves ample headroom on the 6 GB RTX 4050 for concurrent desktop applications.
4. **Security**:
   - Arbitrary shell commands are explicitly forbidden. Only tools defined in the safe registry can execute.
