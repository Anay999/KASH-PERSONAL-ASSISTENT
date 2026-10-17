"""
REST API routes for Project JARVIS.
Includes health check, model management, memory management, and text fallback chat.
"""
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..ai.ollama_client import ollama_client
from ..voice.stt import recognizer
from ..voice.tts import tts_engine
from ..memory.memory_manager import memory_manager
from ..tools.registry import registry
from ..core.config import settings
from ..ai.persona import build_prompt_with_memories, sanitize_ai_response

router = APIRouter(prefix="/api", tags=["jarvis"])

class TextChatRequest(BaseModel):
    message: str = Field(..., description="User's query")
    conversation_id: Optional[str] = Field(default=None)
    model: Optional[str] = Field(default=None)

class SaveMemoryRequest(BaseModel):
    key: str
    value: str
    category: str = "general"

@router.get("/health")
async def get_health():
    """
    Returns full health and telemetry of local AI components:
    Ollama status, active models, faster-whisper device, TTS provider.
    """
    ollama_status = await ollama_client.check_health()
    return {
        "status": "healthy",
        "ollama": ollama_status,
        "stt": {
            "model": settings.whisper_model_size,
            "device": recognizer.device_used,
            "initialized": recognizer.model is not None
        },
        "tts": {
            "primary_voice": settings.tts_primary_voice,
            "active_provider": tts_engine.active_provider,
            "offline_available": True
        },
        "target_specs": {
            "os": "Windows 11",
            "gpu": "NVIDIA RTX 4050 (6GB VRAM)",
            "memory": "16 GB RAM"
        }
    }

@router.get("/system/metrics")
async def get_system_metrics():
    """Returns real-time hardware telemetry: CPU, RAM, RTX 4050 VRAM, Disk."""
    from ..tools.system_tools import get_system_status
    return await get_system_status()

@router.get("/projects/tree")
async def get_project_tree():
    """Returns safe read-only project workspace directory structure."""
    import os
    root = settings.workspace_root
    tree = []
    ignored = {".git", "node_modules", "__pycache__", ".venv", "venv", "dist", "build", "src_baseline_backup"}
    try:
        for item in sorted(os.listdir(root)):
            if item.startswith(".") and item not in (".env.example",):
                continue
            if item in ignored:
                continue
            full_path = os.path.join(root, item)
            is_dir = os.path.isdir(full_path)
            size = 0
            children_count = 0
            if not is_dir:
                try:
                    size = os.path.getsize(full_path)
                except Exception:
                    size = 0
            else:
                try:
                    children = [c for c in os.listdir(full_path) if c not in ignored and not c.startswith(".")]
                    children_count = len(children)
                except Exception:
                    children_count = 0
            tree.append({
                "name": item,
                "is_dir": is_dir,
                "size": size,
                "children_count": children_count
            })
    except Exception as e:
        return {"workspace": root, "items": [], "error": str(e)}
    return {"workspace": root, "items": tree}

@router.get("/models")
async def get_models():
    """Returns installed Ollama models and candidate status."""
    installed = await ollama_client.list_models()
    return {
        "installed": installed,
        "default": settings.default_model,
        "reasoning": settings.reasoning_model
    }

@router.post("/chat")
async def text_chat_fallback(req: TextChatRequest):
    """
    Text-only conversation fallback endpoint.
    Guarantees seamless interaction even if microphone/audio devices fail.
    """
    conv_id = await memory_manager.get_or_create_conversation(req.conversation_id)
    await memory_manager.add_message(conv_id, "user", req.message)

    history = await memory_manager.get_conversation_history(conv_id, limit=12)
    memories = await memory_manager.get_all_memories()

    system_prompt = build_prompt_with_memories(memories)
    messages: List[Dict[str, str]] = [{"role": "system", "content": system_prompt}]
    for m in history:
        messages.append({"role": m["role"], "content": m["content"]})

    if not messages or messages[-1].get("role") != "user":
        messages.append({"role": "user", "content": req.message})

    tool_schemas = registry.get_ollama_tools()
    ai_response_chunks = []
    tool_calls = []

    async for chunk in ollama_client.stream_chat(
        messages=messages,
        model=req.model or settings.default_model,
        tools=tool_schemas
    ):
        if chunk.get("type") == "token":
            ai_response_chunks.append(chunk.get("content", ""))
        elif chunk.get("type") == "tool_calls":
            tool_calls.extend(chunk.get("calls", []))
        elif chunk.get("type") == "error":
            raise HTTPException(status_code=500, detail=chunk.get("message"))

    full_text = "".join(ai_response_chunks)
    
    # If tools were invoked by Ollama, execute them and generate final answer
    if tool_calls:
        import json
        for tc in tool_calls:
            fn = tc.get("function", {})
            fn_name = fn.get("name")
            fn_args = fn.get("arguments", {})
            if isinstance(fn_args, str):
                try:
                    fn_args = json.loads(fn_args)
                except json.JSONDecodeError:
                    fn_args = {}
            tool_output = await registry.dispatch(fn_name, fn_args)
            messages.append({"role": "assistant", "content": full_text or f"Executing {fn_name}."})
            messages.append({"role": "tool", "content": json.dumps(tool_output)})
            
            follow_chunks = []
            async for follow_chunk in ollama_client.stream_chat(
                messages=messages,
                model=req.model or settings.default_model
            ):
                if follow_chunk.get("type") == "token":
                    follow_chunks.append(follow_chunk.get("content", ""))
            if follow_chunks:
                full_text = "".join(follow_chunks)

    clean_text = sanitize_ai_response(full_text)
    if clean_text or tool_calls:
        await memory_manager.add_message(conv_id, "assistant", clean_text, tool_calls=tool_calls)

    return {
        "conversation_id": conv_id,
        "response": clean_text,
        "tool_calls": tool_calls
    }

# Memory routes
@router.get("/memories")
async def list_memories():
    return await memory_manager.get_all_memories()

@router.post("/memories")
async def create_memory(req: SaveMemoryRequest):
    res = await memory_manager.save_memory(req.key, req.value, req.category)
    return {"status": "success", "memory": res}

@router.delete("/memories/{memory_id}")
async def delete_memory(memory_id: int):
    await memory_manager.delete_memory(memory_id)
    return {"status": "success"}

@router.post("/memories/clear")
async def clear_memories():
    await memory_manager.clear_all_memories()
    return {"status": "success", "message": "All persistent memories cleared."}

# Conversation routes
@router.get("/conversations")
async def list_conversations():
    return await memory_manager.list_conversations()

@router.get("/conversations/{conv_id}")
async def get_conversation(conv_id: str):
    history = await memory_manager.get_conversation_history(conv_id, limit=50)
    return {"conversation_id": conv_id, "messages": history}

@router.post("/conversations/clear")
async def clear_conversations():
    await memory_manager.clear_all_conversations()
    return {"status": "success", "message": "All conversations cleared."}
