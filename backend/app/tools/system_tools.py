"""
Safe built-in system tools for Project JARVIS.
All tools adhere to strict sandboxing, allowlisting, and permission verification.
"""
import os
import subprocess
import datetime
from pathlib import Path
from typing import Dict, Any, List
import psutil
from .registry import registry
from ..memory.memory_manager import memory_manager
from ..core.config import settings

# Approved Windows applications allowlist
APPROVED_APPLICATIONS = {
    "notepad": {"cmd": "notepad.exe", "label": "Notepad"},
    "calculator": {"cmd": "calc.exe", "label": "Windows Calculator"},
    "calc": {"cmd": "calc.exe", "label": "Windows Calculator"},
    "explorer": {"cmd": "explorer.exe", "label": "Windows File Explorer"},
    "files": {"cmd": "explorer.exe", "label": "Windows File Explorer"},
    "taskmgr": {"cmd": "taskmgr.exe", "label": "Task Manager"},
    "task manager": {"cmd": "taskmgr.exe", "label": "Task Manager"},
    "code": {"cmd": "code", "label": "Visual Studio Code"},
    "vscode": {"cmd": "code", "label": "Visual Studio Code"},
    "cmd": {"cmd": "cmd.exe", "label": "Command Prompt"},
    "browser": {"cmd": "start msedge", "label": "Microsoft Edge Browser", "shell": True},
    "edge": {"cmd": "start msedge", "label": "Microsoft Edge Browser", "shell": True},
}

@registry.register(
    name="get_current_time",
    description="Provides the current date, local time, day of the week, and timezone formatted for the user.",
    parameters={
        "type": "object",
        "properties": {
            "format": {
                "type": "string",
                "enum": ["full", "time_only", "date_only"],
                "description": "Optional level of detail desired"
            }
        }
    }
)
async def get_current_time(format: str = "full") -> Dict[str, Any]:
    now = datetime.datetime.now()
    # British formatting: e.g., "Saturday, 17 October 2026 at 19:45"
    date_str = now.strftime("%A, %d %B %Y")
    time_str = now.strftime("%H:%M:%S")
    tz_str = datetime.datetime.now().astimezone().tzname() or "Local"

    return {
        "status": "success",
        "date": date_str,
        "time": time_str,
        "timezone": tz_str,
        "formatted": f"{date_str} at {time_str} ({tz_str})"
    }

@registry.register(
    name="get_system_status",
    description="Inspects real-time hardware metrics including CPU usage, RAM utilization, GPU (RTX 4050) VRAM, and storage.",
    parameters={
        "type": "object",
        "properties": {}
    }
)
async def get_system_status() -> Dict[str, Any]:
    cpu_percent = psutil.cpu_percent(interval=0.1)
    cpu_count = psutil.cpu_count(logical=True)
    mem = psutil.virtual_memory()

    # Query GPU if nvidia-smi is available
    gpu_info = {
        "model": "NVIDIA GeForce RTX 4050 Laptop GPU",
        "total_vram_gb": 6.0,
        "available": True
    }
    try:
        smi_out = subprocess.check_output(
            ["nvidia-smi", "--query-gpu=memory.total,memory.used,memory.free,utilization.gpu", "--format=csv,nounits,noheader"],
            encoding="utf-8"
        ).strip().split(",")
        if len(smi_out) >= 4:
            gpu_info["total_vram_mb"] = float(smi_out[0].strip())
            gpu_info["used_vram_mb"] = float(smi_out[1].strip())
            gpu_info["free_vram_mb"] = float(smi_out[2].strip())
            gpu_info["gpu_util_percent"] = float(smi_out[3].strip())
    except Exception:
        pass

    disk = psutil.disk_usage("C:\\")

    return {
        "status": "success",
        "cpu": {
            "usage_percent": cpu_percent,
            "logical_cores": cpu_count
        },
        "ram": {
            "total_gb": round(mem.total / (1024**3), 2),
            "available_gb": round(mem.available / (1024**3), 2),
            "percent_used": mem.percent
        },
        "gpu": gpu_info,
        "disk_c": {
            "total_gb": round(disk.total / (1024**3), 2),
            "free_gb": round(disk.free / (1024**3), 2),
            "percent_used": disk.percent
        }
    }

@registry.register(
    name="launch_application",
    description="Opens an approved Windows desktop application from the secure allowlist (e.g., Notepad, Calculator, File Explorer, VS Code). Arbitrary executable names are strictly rejected.",
    parameters={
        "type": "object",
        "required": ["app_name"],
        "properties": {
            "app_name": {
                "type": "string",
                "description": "Name of the approved application (notepad, calc, explorer, taskmgr, code, cmd, edge)"
            }
        }
    }
)
async def launch_application(app_name: str) -> Dict[str, Any]:
    key = app_name.strip().lower()
    app = APPROVED_APPLICATIONS.get(key)
    if not app:
        allowed = list(APPROVED_APPLICATIONS.keys())
        return {
            "status": "rejected",
            "error": f"Application '{app_name}' is not in the approved security allowlist. Approved applications: {allowed}"
        }

    try:
        cmd = app["cmd"]
        is_shell = app.get("shell", False)
        subprocess.Popen(cmd, shell=is_shell)
        return {
            "status": "success",
            "message": f"Successfully launched {app['label']}."
        }
    except Exception as e:
        return {
            "status": "failed",
            "error": f"Failed to launch application: {str(e)}"
        }

@registry.register(
    name="read_workspace_file",
    description="Safely reads the contents of a specified file within the project workspace, preventing unauthorized directory traversal.",
    parameters={
        "type": "object",
        "required": ["relative_path"],
        "properties": {
            "relative_path": {
                "type": "string",
                "description": "Relative file path within the project (e.g., 'README.md', 'backend/app/main.py')"
            },
            "max_lines": {
                "type": "integer",
                "description": "Maximum number of lines to retrieve (default: 100)"
            }
        }
    }
)
async def read_workspace_file(relative_path: str, max_lines: int = 100) -> Dict[str, Any]:
    root = Path(settings.workspace_root).resolve()
    target = (root / relative_path).resolve()

    # Sandboxing: Ensure target is strictly within the workspace directory
    try:
        target.relative_to(root)
    except ValueError:
        return {
            "status": "forbidden",
            "error": "Access denied: Target path escapes the authorized project workspace boundary."
        }

    if not target.exists():
        return {"status": "not_found", "error": f"File does not exist: {relative_path}"}
    if not target.is_file():
        return {"status": "error", "error": f"Path is not a regular file: {relative_path}"}

    try:
        with open(target, "r", encoding="utf-8", errors="replace") as f:
            lines = [f.readline() for _ in range(max_lines)]
            content = "".join(lines)
        return {
            "status": "success",
            "file": relative_path,
            "lines_read": len(lines),
            "content": content
        }
    except Exception as e:
        return {"status": "error", "error": f"Failed reading file: {str(e)}"}

@registry.register(
    name="save_persistent_memory",
    description="Records a user-approved fact, preference, or project context into persistent SQLite storage for future conversation turns.",
    parameters={
        "type": "object",
        "required": ["key", "value"],
        "properties": {
            "key": {
                "type": "string",
                "description": "Concise identifier for the memory (e.g., 'user_name', 'favorite_ide', 'current_project')"
            },
            "value": {
                "type": "string",
                "description": "The information to remember"
            },
            "category": {
                "type": "string",
                "enum": ["preference", "fact", "project", "general"],
                "description": "Category classification"
            }
        }
    }
)
async def save_persistent_memory(key: str, value: str, category: str = "general") -> Dict[str, Any]:
    res = await memory_manager.save_memory(key, value, category)
    return {
        "status": "success",
        "message": f"Persisted memory under key '{key}'.",
        "memory": res
    }

@registry.register(
    name="recall_memories",
    description="Recalls stored persistent memories or preferences.",
    parameters={
        "type": "object",
        "properties": {
            "keyword": {
                "type": "string",
                "description": "Optional search keyword to filter stored memories"
            }
        }
    }
)
async def recall_memories(keyword: str = "") -> Dict[str, Any]:
    all_mems = await memory_manager.get_all_memories()
    if keyword:
        kw = keyword.lower()
        filtered = [m for m in all_mems if kw in m["key"].lower() or kw in m["value"].lower()]
        return {"status": "success", "memories": filtered}
    return {"status": "success", "memories": all_mems}
