"""Agent-based LLM generation with SSE streaming via PydanticAI iter()."""

from __future__ import annotations

import json
from collections.abc import AsyncGenerator, Sequence
from dataclasses import dataclass, field
from typing import Any

import yaml
from pydantic_ai import Agent
from pydantic_ai.messages import (
    FunctionToolCallEvent,
    FunctionToolResultEvent,
    ModelMessage,
    PartDeltaEvent,
    PartStartEvent,
    TextPart,
    TextPartDelta,
)

from _utils.logging import get_logger
from auth.session import SessionData

logger = get_logger(__name__)

_RESULT_TOOL_PREFIX = "final_result"


@dataclass
class AgentDeps:
    """Dependencies available to all agent tool calls."""

    session: SessionData
    created_playbook_id: str | None = field(default=None, repr=False)
    updated_playbook_id: str | None = field(default=None, repr=False)
    # When set (e.g. failed-run debug or playbook generate with probe host), run_ssh_command works.
    host_id: str = ""
    host_ip: str = ""
    host_ssh_user: str = ""
    host_ssh_port: int = 22


def _sse(payload: dict[str, Any]) -> str:
    return f"data: {json.dumps(payload)}\n\n"


def _summarize_tool_args(tool_name: str, raw_json: str) -> dict[str, Any]:
    """Produce a compact summary of tool call arguments for the frontend."""
    try:
        args = json.loads(raw_json)
    except Exception:
        return {}
    if tool_name in ("create_role", "update_role"):
        role = args.get("role", args)
        return {
            "name": role.get("name", ""),
            "description": (role.get("description") or "")[:200],
        }
    if tool_name in ("create_playbook", "update_playbook"):
        pb = args.get("playbook", args)
        return {
            "name": pb.get("name", ""),
            "role_count": len(pb.get("roles", [])),
        }
    if tool_name == "get_role_detail":
        return {"role_id": args.get("role_id", "")}
    if tool_name == "get_playbook":
        return {"playbook_id": args.get("playbook_id", "")}
    if tool_name == "run_ssh_command":
        cmd = str(args.get("command", ""))
        return {"command": cmd[:160] + ("…" if len(cmd) > 160 else "")}
    if tool_name == "run_playbook":
        return {"playbook_id": args.get("playbook_id", "")}
    if tool_name == "run_role":
        return {"role_id": args.get("role_id", ""), "become": args.get("become", False)}
    return {}


async def stream_agent(
    agent: Agent[Any, Any],
    prompt: str,
    deps: AgentDeps,
    *,
    instructions: str | None = None,
) -> AsyncGenerator[str]:
    """Run a PydanticAI agent via ``iter()`` and yield unified SSE events.

    Event types emitted:
      - ``{"type": "thinking", "text": "<delta>"}``
      - ``{"type": "tool_call", "tool": "<name>", "args": {...}}``
      - ``{"type": "tool_result", "tool": "<name>", "result": "..."}``
      - ``{"type": "done", ...}``  (yaml / playbook_id / message)
      - ``{"type": "error", "message": "..."}``
      - ``data: [DONE]``  sentinel
    """
    from _utils.ai import get_model

    model = get_model()

    try:
        async with agent.iter(
            user_prompt=prompt,
            deps=deps,
            model=model,
            instructions=instructions,
        ) as run:
            async for node in run:
                if Agent.is_model_request_node(node):
                    async with node.stream(run.ctx) as request_stream:
                        async for event in request_stream:
                            if isinstance(event, PartStartEvent) and isinstance(
                                event.part, TextPart
                            ):
                                if event.part.content:
                                    yield _sse(
                                        {"type": "thinking", "text": event.part.content}
                                    )
                            elif isinstance(event, PartDeltaEvent) and isinstance(
                                event.delta, TextPartDelta
                            ):
                                yield _sse(
                                    {
                                        "type": "thinking",
                                        "text": event.delta.content_delta,
                                    }
                                )

                elif Agent.is_call_tools_node(node):
                    current_tool: str | None = None
                    async with node.stream(run.ctx) as handle_stream:
                        async for tool_event in handle_stream:
                            if isinstance(tool_event, FunctionToolCallEvent):
                                name = tool_event.part.tool_name
                                if name.startswith(_RESULT_TOOL_PREFIX):
                                    current_tool = None
                                    continue
                                current_tool = name
                                yield _sse(
                                    {
                                        "type": "tool_call",
                                        "tool": name,
                                        "args": _summarize_tool_args(
                                            name,
                                            tool_event.part.args_as_json_str(),
                                        ),
                                    }
                                )
                            elif isinstance(tool_event, FunctionToolResultEvent):
                                if current_tool:
                                    content = (
                                        tool_event.result.content
                                        if hasattr(tool_event, "result")
                                        else str(tool_event)
                                    )
                                    yield _sse(
                                        {
                                            "type": "tool_result",
                                            "tool": current_tool,
                                            "result": str(content)[:2000],
                                        }
                                    )
                                    current_tool = None

            # Build the done payload from the agent's final output.
            if run.result is None:
                yield _sse({"type": "error", "message": "Agent finished without producing a result."})
                yield "data: [DONE]\n\n"
                return

            result_output = run.result.output
            done: dict[str, Any] = {"type": "done"}

            if hasattr(result_output, "model_dump"):
                done["yaml"] = yaml.dump(
                    result_output.model_dump(exclude_defaults=True),
                    default_flow_style=False,
                    sort_keys=False,
                )

            if deps.created_playbook_id:
                done["playbook_id"] = deps.created_playbook_id

            if deps.updated_playbook_id:
                done["playbook_id"] = deps.updated_playbook_id

            if isinstance(result_output, str) and result_output:
                done["message"] = result_output

            yield _sse(done)

    except Exception as exc:
        logger.error("agent_stream_failed", error=str(exc), exc_info=True)
        yield _sse({"type": "error", "message": str(exc)})

    yield "data: [DONE]\n\n"


async def stream_racksmith_turn(
    agent: Agent[Any, Any],
    *,
    user_prompt: str,
    deps: AgentDeps,
    message_history: Sequence[ModelMessage] | None,
    instructions: str | None,
    persisted_messages: list[ModelMessage],
) -> AsyncGenerator[str]:
    """Run one chat turn with optional prior ``ModelMessage`` history; update ``persisted_messages`` on success."""
    from _utils.ai import get_model

    model = get_model()
    history_list: list[ModelMessage] = list(message_history) if message_history else []

    try:
        async with agent.iter(
            user_prompt=user_prompt,
            message_history=history_list or None,
            deps=deps,
            model=model,
            instructions=instructions,
        ) as run:
            async for node in run:
                if Agent.is_model_request_node(node):
                    async with node.stream(run.ctx) as request_stream:
                        async for event in request_stream:
                            if isinstance(event, PartStartEvent) and isinstance(
                                event.part, TextPart
                            ):
                                if event.part.content:
                                    yield _sse(
                                        {"type": "thinking", "text": event.part.content}
                                    )
                            elif isinstance(event, PartDeltaEvent) and isinstance(
                                event.delta, TextPartDelta
                            ):
                                yield _sse(
                                    {
                                        "type": "thinking",
                                        "text": event.delta.content_delta,
                                    }
                                )

                elif Agent.is_call_tools_node(node):
                    current_tool: str | None = None
                    async with node.stream(run.ctx) as handle_stream:
                        async for tool_event in handle_stream:
                            if isinstance(tool_event, FunctionToolCallEvent):
                                name = tool_event.part.tool_name
                                if name.startswith(_RESULT_TOOL_PREFIX):
                                    current_tool = None
                                    continue
                                current_tool = name
                                yield _sse(
                                    {
                                        "type": "tool_call",
                                        "tool": name,
                                        "args": _summarize_tool_args(
                                            name,
                                            tool_event.part.args_as_json_str(),
                                        ),
                                    }
                                )
                            elif isinstance(tool_event, FunctionToolResultEvent):
                                if current_tool:
                                    content = (
                                        tool_event.result.content
                                        if hasattr(tool_event, "result")
                                        else str(tool_event)
                                    )
                                    yield _sse(
                                        {
                                            "type": "tool_result",
                                            "tool": current_tool,
                                            "result": str(content)[:2000],
                                        }
                                    )
                                    current_tool = None

            if run.result is None:
                yield _sse({"type": "error", "message": "Agent finished without producing a result."})
                yield "data: [DONE]\n\n"
                return

            result_output = run.result.output
            done: dict[str, Any] = {"type": "done"}

            if hasattr(result_output, "model_dump"):
                done["yaml"] = yaml.dump(
                    result_output.model_dump(exclude_defaults=True),
                    default_flow_style=False,
                    sort_keys=False,
                )

            if deps.created_playbook_id:
                done["playbook_id"] = deps.created_playbook_id

            if deps.updated_playbook_id:
                done["playbook_id"] = deps.updated_playbook_id

            if isinstance(result_output, str) and result_output:
                done["message"] = result_output

            yield _sse(done)

            persisted_messages.clear()
            persisted_messages.extend(run.all_messages())

    except Exception as exc:
        logger.error("racksmith_turn_failed", error=str(exc), exc_info=True)
        yield _sse({"type": "error", "message": str(exc)})

    yield "data: [DONE]\n\n"
