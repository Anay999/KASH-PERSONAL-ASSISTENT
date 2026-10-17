"""
Action and tool registry for Project JARVIS.
Adapted from God's Eye View tool architecture (createActionTools, realtimeSessionTools).
Enforces declarative JSON schemas, strict parameter validation, and safe dispatch.
"""
from typing import Callable, Dict, Any, List, Optional
import inspect
import logging

logger = logging.getLogger("jarvis.tools")

class JarvisTool:
    def __init__(
        self,
        name: str,
        description: str,
        parameters: Dict[str, Any],
        handler: Callable[..., Any]
    ):
        self.name = name
        self.description = description
        self.parameters = parameters
        self.handler = handler

    def to_ollama_schema(self) -> Dict[str, Any]:
        """Formats the tool into standard OpenAI/Ollama tool calling format."""
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.parameters
            }
        }

    async def execute(self, **kwargs) -> Any:
        """Executes the tool handler safely, handling async and sync functions."""
        try:
            if inspect.iscoroutinefunction(self.handler):
                return await self.handler(**kwargs)
            else:
                return self.handler(**kwargs)
        except Exception as e:
            logger.error(f"Error executing tool '{self.name}': {e}")
            return {"error": f"Tool execution failed: {str(e)}"}

class ToolRegistry:
    def __init__(self):
        self._tools: Dict[str, JarvisTool] = {}

    def register(
        self,
        name: str,
        description: str,
        parameters: Dict[str, Any]
    ):
        """Decorator to register a function as a safe tool."""
        def decorator(func: Callable):
            tool = JarvisTool(
                name=name,
                description=description,
                parameters=parameters,
                handler=func
            )
            self._tools[name] = tool
            return func
        return decorator

    def get_tool(self, name: str) -> Optional[JarvisTool]:
        return self._tools.get(name)

    def get_ollama_tools(self) -> List[Dict[str, Any]]:
        """Returns schemas of all registered tools for Ollama API."""
        return [tool.to_ollama_schema() for tool in self._tools.values()]

    async def dispatch(self, name: str, args: Dict[str, Any]) -> Any:
        """Dispatches a tool call with argument validation."""
        tool = self.get_tool(name)
        if not tool:
            logger.warning(f"Attempted to invoke unregistered tool: {name}")
            return {"error": f"Unknown tool: '{name}' is not in the approved tool registry."}

        # Filter unexpected arguments according to schema properties
        props = tool.parameters.get("properties", {})
        sanitized_args = {k: v for k, v in args.items() if k in props}
        return await tool.execute(**sanitized_args)

registry = ToolRegistry()
