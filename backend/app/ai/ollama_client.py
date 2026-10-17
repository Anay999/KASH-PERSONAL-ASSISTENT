"""
Asynchronous Ollama client for local model inference.
Handles model discovery, streaming chat, and tool execution formatting.
"""
import json
import logging
from typing import AsyncGenerator, Dict, List, Any, Optional
import httpx
from ..core.config import settings
from .persona import sanitize_ai_response

logger = logging.getLogger("jarvis.ai")

class OllamaClient:
    def __init__(self, base_url: Optional[str] = None):
        self.base_url = (base_url or settings.ollama_host).rstrip("/")

    async def check_health(self) -> Dict[str, Any]:
        """
        Tests connectivity to Ollama and returns available models and server version.
        """
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                resp = await client.get(f"{self.base_url}/api/tags")
                if resp.status_code == 200:
                    data = resp.json()
                    models = [m.get("name") for m in data.get("models", [])]
                    return {
                        "online": True,
                        "models": models,
                        "default_installed": any(settings.default_model in m for m in models),
                        "reasoning_installed": any(settings.reasoning_model in m for m in models),
                        "host": self.base_url
                    }
        except Exception as e:
            logger.warning(f"Ollama connection check failed: {e}")
        
        return {
            "online": False,
            "models": [],
            "default_installed": False,
            "reasoning_installed": False,
            "host": self.base_url,
            "error": "Ollama service is not reachable. Ensure 'ollama serve' is running."
        }

    async def list_models(self) -> List[Dict[str, Any]]:
        """Returns details of all installed models."""
        try:
            async with httpx.AsyncClient(timeout=4.0) as client:
                resp = await client.get(f"{self.base_url}/api/tags")
                if resp.status_code == 200:
                    return resp.json().get("models", [])
        except Exception as e:
            logger.error(f"Error listing models: {e}")
        return []

    async def stream_chat(
        self,
        messages: List[Dict[str, str]],
        model: Optional[str] = None,
        tools: Optional[List[Dict[str, Any]]] = None,
        temperature: Optional[float] = None,
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Streams chat responses token-by-token from Ollama.
        Filters out internal reasoning traces in real-time.
        Yields dicts with {"type": "token", "content": str} or {"type": "tool_calls", "calls": list}.
        """
        target_model = model or settings.default_model
        payload: Dict[str, Any] = {
            "model": target_model,
            "messages": messages,
            "stream": True,
            "options": {
                "temperature": temperature if temperature is not None else settings.temperature
            }
        }
        if tools:
            payload["tools"] = tools

        in_think_block = False
        accumulated_text = ""

        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                async with client.stream("POST", f"{self.base_url}/api/chat", json=payload) as resp:
                    if resp.status_code != 200:
                        err_text = await resp.aread()
                        yield {
                            "type": "error",
                            "message": f"Ollama HTTP {resp.status_code}: {err_text.decode('utf-8', errors='ignore')}"
                        }
                        return

                    async for line in resp.aiter_lines():
                        if not line.strip():
                            continue
                        try:
                            data = json.loads(line)
                        except json.JSONDecodeError:
                            continue

                        msg = data.get("message", {})
                        raw_content = msg.get("content", "")
                        tool_calls = msg.get("tool_calls", [])

                        if tool_calls:
                            yield {
                                "type": "tool_calls",
                                "calls": tool_calls
                            }

                        if raw_content:
                            accumulated_text += raw_content
                            # Check for <think> tag start or end
                            if "<think>" in raw_content:
                                in_think_block = True
                            if "</think>" in raw_content:
                                in_think_block = False
                                continue

                            if not in_think_block:
                                # Clean any residual tags
                                clean_token = raw_content.replace("<think>", "").replace("</think>", "")
                                if clean_token:
                                    yield {
                                        "type": "token",
                                        "content": clean_token
                                    }

                        if data.get("done", False):
                            cleaned_full = sanitize_ai_response(accumulated_text)
                            yield {
                                "type": "done",
                                "full_response": cleaned_full,
                                "total_duration": data.get("total_duration")
                            }
                            break

        except httpx.ConnectError:
            yield {
                "type": "error",
                "message": (
                    "Could not connect to Ollama at "
                    f"{self.base_url}. Please ensure Ollama is running ('ollama serve')."
                )
            }
        except Exception as e:
            logger.error(f"Ollama chat streaming exception: {e}")
            yield {
                "type": "error",
                "message": f"Inference engine encountered an unexpected error: {str(e)}"
            }

ollama_client = OllamaClient()
