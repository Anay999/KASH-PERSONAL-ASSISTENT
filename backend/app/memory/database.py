"""
SQLite database initialization and connection management using aiosqlite.
"""
import logging
from typing import AsyncGenerator
import aiosqlite
from ..core.config import settings

logger = logging.getLogger("jarvis.memory")

CREATE_TABLES_SQL = """
CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    title TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id TEXT,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    tool_calls TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS memories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT UNIQUE NOT NULL,
    value TEXT NOT NULL,
    category TEXT DEFAULT 'general',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
"""

async def init_db():
    """Initializes the SQLite schema."""
    logger.info(f"Initializing SQLite database at {settings.db_path}...")
    async with aiosqlite.connect(settings.db_path) as db:
        await db.executescript(CREATE_TABLES_SQL)
        await db.commit()
    logger.info("Database initialized successfully.")

async def get_db() -> AsyncGenerator[aiosqlite.Connection, None]:
    """Dependency / context helper for database connections."""
    async with aiosqlite.connect(settings.db_path) as db:
        db.row_factory = aiosqlite.Row
        yield db
