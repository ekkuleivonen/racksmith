"""Map stored ``ModelMessage`` history to a simple list for the SPA."""

from __future__ import annotations

import json
from typing import Any

from pydantic_ai.messages import (
    BuiltinToolCallPart,
    BuiltinToolReturnPart,
    FilePart,
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

from _utils.agent_stream import _summarize_tool_args

_RESULT_TOOL_PREFIX = "final_result"


def _args_json_str(part: ToolCallPart | BuiltinToolCallPart) -> str:
    fn = getattr(part, "args_as_json_str", None)
    if callable(fn):
        return fn()
    if isinstance(part.args, dict):
        return json.dumps(part.args)
    if isinstance(part.args, str):
        return part.args
    return "{}"


def _tool_return_preview(content: object) -> str:
    s = str(content)
    if len(s) > 2000:
        return s[:2000] + "…"
    return s


def model_messages_to_ui(items: list[ModelMessage]) -> list[dict[str, Any]]:
    """Flatten model messages into rows the frontend can render."""
    out: list[dict[str, Any]] = []
    assistant_buf: list[str] = []

    def flush_assistant() -> None:
        if not assistant_buf:
            return
        t = "\n".join(assistant_buf).strip()
        assistant_buf.clear()
        if t:
            out.append({"kind": "assistant", "text": t})

    for m in items:
        if isinstance(m, ModelRequest):
            flush_assistant()
            for req_part in m.parts:
                if isinstance(req_part, UserPromptPart):
                    t = str(req_part.content).strip()
                    if t:
                        out.append({"kind": "user", "text": t})
                elif isinstance(req_part, SystemPromptPart):
                    t = str(req_part.content).strip()
                    if t:
                        out.append({"kind": "system", "text": t})
                elif isinstance(req_part, RetryPromptPart):
                    t = str(req_part.content).strip()
                    if t:
                        out.append({"kind": "other", "text": t})
        elif isinstance(m, ModelResponse):
            for resp_part in m.parts:
                if isinstance(resp_part, TextPart):
                    c = str(resp_part.content).strip()
                    if c:
                        assistant_buf.append(c)
                elif isinstance(resp_part, ThinkingPart):
                    flush_assistant()
                    t = str(resp_part.content).strip()
                    if t:
                        out.append({"kind": "thinking", "text": t})
                elif isinstance(resp_part, ToolCallPart | BuiltinToolCallPart):
                    flush_assistant()
                    if resp_part.tool_name.startswith(_RESULT_TOOL_PREFIX):
                        continue
                    summarized = _summarize_tool_args(
                        resp_part.tool_name, _args_json_str(resp_part)
                    )
                    out.append(
                        {
                            "kind": "tool_call",
                            "tool": resp_part.tool_name,
                            "args": summarized or None,
                            "text": resp_part.tool_name,
                        }
                    )
                elif isinstance(resp_part, ToolReturnPart | BuiltinToolReturnPart):
                    flush_assistant()
                    preview = _tool_return_preview(resp_part.content)
                    oc = getattr(resp_part, "outcome", "success")
                    out.append(
                        {
                            "kind": "tool_result",
                            "tool": resp_part.tool_name,
                            "result_preview": preview,
                            "outcome": str(oc),
                            "text": preview[:280] + ("…" if len(preview) > 280 else ""),
                        }
                    )
                elif isinstance(resp_part, FilePart):
                    continue
                else:
                    continue
        else:
            flush_assistant()
            out.append({"kind": "other", "text": repr(m)})

    flush_assistant()
    return out
