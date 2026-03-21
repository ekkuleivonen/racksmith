"""Map stored ``ModelMessage`` history to a simple list for the SPA."""

from __future__ import annotations

from typing import Any, Literal

from pydantic_ai.messages import (
    BuiltinToolCallPart,
    BuiltinToolReturnPart,
    ModelMessage,
    ModelRequest,
    ModelResponse,
    RetryPromptPart,
    SystemPromptPart,
    TextPart,
    ThinkingPart,
    ToolCallPart,
    ToolReturnPart,
    UserPromptPart,
)

UiMsgKind = Literal["user", "assistant", "tool", "system", "other"]


def _text_from_parts(parts: object) -> str:
    if not isinstance(parts, list):
        return ""
    chunks: list[str] = []
    for p in parts:
        if isinstance(p, UserPromptPart):
            chunks.append(str(p.content))
        elif isinstance(p, TextPart):
            chunks.append(str(p.content))
        elif isinstance(p, ThinkingPart):
            chunks.append(str(p.content))
        elif isinstance(p, ToolCallPart | BuiltinToolCallPart):
            chunks.append(f"[tool call {p.tool_name}]")
        elif isinstance(p, ToolReturnPart | BuiltinToolReturnPart):
            chunks.append(f"[tool result {p.tool_name}]")
        elif isinstance(p, RetryPromptPart):
            chunks.append(str(p.content))
        elif isinstance(p, SystemPromptPart):
            chunks.append(str(p.content))
    return "\n".join(c for c in chunks if c).strip()


def model_messages_to_ui(items: list[ModelMessage]) -> list[dict[str, Any]]:
    """Flatten model messages into rows the frontend can render as bubbles."""
    out: list[dict[str, Any]] = []
    for m in items:
        if isinstance(m, ModelRequest):
            t = _text_from_parts(m.parts)
            if t:
                out.append({"kind": "user", "text": t})
        elif isinstance(m, ModelResponse):
            t = _text_from_parts(m.parts)
            if t:
                out.append({"kind": "assistant", "text": t})
        else:
            out.append({"kind": "other", "text": repr(m)})
    return out
