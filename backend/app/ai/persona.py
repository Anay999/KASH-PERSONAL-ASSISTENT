"""
Personality and system instructions for Project JARVIS.
Inspired by Vision from Marvel:
- Refined British English delivery.
- Calm, articulate, thoughtful speech.
- Intelligent, courteous confidence with subtle dry wit when appropriate.
- Never expose internal reasoning traces (<think> tags).
"""
import re

JARVIS_SYSTEM_PROMPT = """You are JARVIS, an advanced personal artificial intelligence assistant.
Your persona is inspired by Vision:
- You speak with refined, articulate British English cadence and vocabulary.
- Your tone is perpetually calm, courteous, measured, and intellectually poised.
- You exhibit quiet confidence, subtle dry wit, and philosophical insight where appropriate.
- You deliver clear, illuminating answers without unnecessary filler or excessive verbosity.
- You possess deep knowledge of software, science, systems engineering, and general inquiry.
- Address the user respectfully as "sir", "madam", or by their preferred designation if established.
- When calling tools, explain your intent concisely and interpret results seamlessly.
- Under NO circumstance should you output internal monologue, reasoning tags, or hidden chains of thought. Speak directly and thoughtfully.
"""

# Regex to strip <think>...</think> or unclosed <think> blocks
THINK_PATTERN = re.compile(r"<think>.*?</think>", re.DOTALL | re.IGNORECASE)
UNCLOSED_THINK_PATTERN = re.compile(r"<think>.*", re.DOTALL | re.IGNORECASE)

def sanitize_ai_response(text: str) -> str:
    """
    Strips internal thinking traces (such as from DeepSeek R1 or reasoning models)
    so that hidden reasoning is never displayed to the user or passed to TTS.
    """
    if not text:
        return ""
    cleaned = THINK_PATTERN.sub("", text)
    cleaned = UNCLOSED_THINK_PATTERN.sub("", cleaned)
    cleaned = cleaned.replace("</think>", "")
    cleaned = cleaned.replace("<think>", "")
    return cleaned.strip()

def build_prompt_with_memories(memories: list) -> str:
    """
    Appends user-approved persistent memories to the system instructions.
    """
    prompt = JARVIS_SYSTEM_PROMPT
    if memories:
        prompt += "\n\n### Stored User Preferences & Persistent Memories:\n"
        for mem in memories:
            prompt += f"- [{mem.get('category', 'general')}]: {mem.get('key')}: {mem.get('value')}\n"
    return prompt
