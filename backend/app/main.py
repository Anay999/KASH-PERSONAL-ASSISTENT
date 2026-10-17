"""
FastAPI application entry point for Project JARVIS.
"""
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .core.config import settings
from .memory.database import init_db
from .voice.stt import recognizer
from .api.routes_chat import router as chat_router
from .api.routes_ws import router as ws_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("jarvis.main")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Initialize SQLite database and STT engine
    logger.info("Initializing Project JARVIS Core Services...")
    await init_db()
    try:
        recognizer.initialize()
    except Exception as e:
        logger.warning(f"Whisper initialization deferred: {e}")
    logger.info("Project JARVIS online and ready.")
    yield
    logger.info("Project JARVIS shutting down.")

app = FastAPI(
    title="Project JARVIS - Personal AI Voice Assistant",
    description="Locally operated personal AI voice assistant with British persona inspired by Marvel's Vision.",
    version="1.0.0",
    lifespan=lifespan
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount API routers
app.include_router(chat_router)
app.include_router(ws_router)

@app.get("/")
async def root():
    return {
        "assistant": "JARVIS",
        "system": "Online",
        "persona": "Vision-inspired Refined British",
        "api_docs": "/docs",
        "websocket": "/ws/session"
    }
