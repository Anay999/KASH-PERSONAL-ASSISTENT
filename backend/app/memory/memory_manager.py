"""
Persistent memory operations for Project JARVIS.
Stores conversations, message turns, and user-approved persistent memories.
"""
import uuid
import json
import logging
from typing import List, Dict, Any, Optional
import aiosqlite
from ..core.config import settings

logger = logging.getLogger("jarvis.memory")

class MemoryManager:
    def __init__(self, db_path: Optional[str] = None):
        self.db_path = db_path or settings.db_path

    async def get_or_create_conversation(self, conv_id: Optional[str] = None, title: Optional[str] = None) -> str:
        async with aiosqlite.connect(self.db_path) as db:
            if conv_id:
                async with db.execute("SELECT id FROM conversations WHERE id = ?", (conv_id,)) as cursor:
                    row = await cursor.fetchone()
                    if row:
                        return row[0]

            new_id = conv_id or str(uuid.uuid4())
            conv_title = title or "JARVIS Interaction"
            await db.execute(
                "INSERT INTO conversations (id, title) VALUES (?, ?)",
                (new_id, conv_title)
            )
            await db.commit()
            return new_id

    async def add_message(
        self,
        conversation_id: str,
        role: str,
        content: str,
        tool_calls: Optional[List[Dict[str, Any]]] = None
    ):
        tool_calls_json = json.dumps(tool_calls) if tool_calls else None
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute(
                """
                INSERT INTO messages (conversation_id, role, content, tool_calls)
                VALUES (?, ?, ?, ?)
                """,
                (conversation_id, role, content, tool_calls_json)
            )
            await db.execute(
                "UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                (conversation_id,)
            )
            await db.commit()

    async def get_conversation_history(self, conversation_id: str, limit: int = 20) -> List[Dict[str, Any]]:
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                """
                SELECT role, content, tool_calls, timestamp
                FROM (
                    SELECT id, role, content, tool_calls, timestamp
                    FROM messages
                    WHERE conversation_id = ?
                      AND ((content IS NOT NULL AND trim(content) != '') OR tool_calls IS NOT NULL)
                    ORDER BY id DESC
                    LIMIT ?
                )
                ORDER BY id ASC
                """,
                (conversation_id, limit)
            ) as cursor:
                rows = await cursor.fetchall()
                messages = []
                for r in rows:
                    item = {"role": r["role"], "content": r["content"], "timestamp": r["timestamp"]}
                    if r["tool_calls"]:
                        try:
                            item["tool_calls"] = json.loads(r["tool_calls"])
                        except json.JSONDecodeError:
                            pass
                    messages.append(item)
                return messages

    async def list_conversations(self, limit: int = 30) -> List[Dict[str, Any]]:
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                """
                SELECT id, title, created_at, updated_at
                FROM conversations
                ORDER BY updated_at DESC
                LIMIT ?
                """,
                (limit,)
            ) as cursor:
                rows = await cursor.fetchall()
                return [dict(r) for r in rows]

    async def clear_all_conversations(self):
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute("DELETE FROM messages")
            await db.execute("DELETE FROM conversations")
            await db.commit()
            logger.info("Cleared all conversation histories.")

    # Persistent user memories (facts, preferences)
    async def save_memory(self, key: str, value: str, category: str = "general") -> Dict[str, Any]:
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute(
                """
                INSERT INTO memories (key, value, category)
                VALUES (?, ?, ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value, category = excluded.category
                """,
                (key.strip(), value.strip(), category.strip().lower())
            )
            await db.commit()
            return {"key": key, "value": value, "category": category}

    async def get_all_memories(self) -> List[Dict[str, Any]]:
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute("SELECT id, key, value, category, created_at FROM memories ORDER BY id DESC") as cursor:
                rows = await cursor.fetchall()
                return [dict(r) for r in rows]

    async def delete_memory(self, memory_id: int):
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute("DELETE FROM memories WHERE id = ?", (memory_id,))
            await db.commit()

    async def clear_all_memories(self):
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute("DELETE FROM memories")
            await db.commit()
            logger.info("Cleared all stored memories.")

memory_manager = MemoryManager()
