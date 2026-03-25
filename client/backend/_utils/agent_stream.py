"""Agent-based LLM generation with SSE streaming via PydanticAI iter()."""

from __future__ import annotations

import json
import re
from collections.abc import AsyncGenerator, Awaitable, Callable, Sequence
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
    RetryPromptPart,
    TextPart,
    TextPartDelta,
)

from _utils.logging import get_logger
from auth.session import SessionData

logger = get_logger(__name__)

_RESULT_TOOL_PREFIX = "final_result"


def _tool_result_for_sse(
    tool_event: FunctionToolResultEvent,
) -> tuple[str, str] | None:
    """Map a streaming tool result event to (tool_name, content text), or None to skip SSE."""
    result_part = tool_event.result
    if isinstance(result_part, RetryPromptPart):
        return None
    tool_name = getattr(result_part, "tool_name", None)
    if not tool_name or str(tool_name).startswith(_RESULT_TOOL_PREFIX):
        return None
    content = getattr(result_part, "content", None)
    text = str(content) if content is not None else ""
    return str(tool_name), text


@dataclass
class AgentDeps:
    """Dependencies available to all agent tool calls."""

    session: SessionData
    created_playbook_id: str | None = field(default=None, repr=False)
    updated_playbook_id: str | None = field(default=None, repr=False)
    run_output_sink: Callable[[dict[str, Any]], Awaitable[None]] | None = field(
        default=None, repr=False
    )


def sse_event(payload: dict[str, Any]) -> str:
    return f"data: {json.dumps(payload)}\n\n"


def _sse(payload: dict[str, Any]) -> str:
    return sse_event(payload)


_RE_RUN_META = re.compile(
    r"run_id=(?P<run_id>[^\s]+)\s+status=(?P<status>\w+)\s+exit_code=(?P<exit_code>-?\d+|None)"
)
_RE_CREATED_ROLE = re.compile(r"Created role '(?P<name>[^']+)'\s+\(id:\s*(?P<id>[^)]+)\)")
_RE_UPDATED_ROLE = re.compile(r"Updated role '(?P<name>[^']+)'\s+\(id:\s*(?P<id>[^)]+)\)")
_RE_PLAYBOOK = re.compile(
    r"(?:Created|Updated) playbook '(?P<name>[^']+)'\s+\(id:\s*(?P<id>[^)]+)\)"
)
_RE_SSH_EXIT = re.compile(r"^exit_code=(?P<code>-?\d+)", re.MULTILINE)


def tool_result_ui_metadata(tool_name: str, content: str) -> dict[str, Any]:
    """Structured fields for SPA tool result cards (SSE + persisted view)."""
    meta: dict[str, Any] = {"result_type": "text"}
    text = content if len(content) <= 4000 else content[:4000] + "…"

    if tool_name in ("run_playbook", "run_role"):
        m = _RE_RUN_META.search(text)
        meta["result_type"] = "run"
        if m:
            meta["entity_id"] = m.group("run_id").strip()
            meta["run_status"] = m.group("status").strip()
            ec = m.group("exit_code")
            meta["exit_code"] = None if ec == "None" else int(ec)
        return meta

    if tool_name == "run_ssh_command":
        meta["result_type"] = "ssh"
        m = _RE_SSH_EXIT.search(text)
        if m:
            meta["exit_code"] = int(m.group("code"))
        return meta

    if tool_name == "create_role":
        m = _RE_CREATED_ROLE.search(text)
        meta["result_type"] = "crud_create"
        if m:
            meta["entity_name"] = m.group("name")
            meta["entity_id"] = m.group("id").strip()
        return meta

    if tool_name == "update_role":
        m = _RE_UPDATED_ROLE.search(text)
        meta["result_type"] = "crud_update"
        if m:
            meta["entity_name"] = m.group("name")
            meta["entity_id"] = m.group("id").strip()
        return meta

    if tool_name in ("create_playbook", "update_playbook"):
        m = _RE_PLAYBOOK.search(text)
        meta["result_type"] = (
            "crud_create" if tool_name == "create_playbook" else "crud_update"
        )
        if m:
            meta["entity_name"] = m.group("name")
            meta["entity_id"] = m.group("id").strip()
        return meta

    if tool_name.startswith("delete_"):
        meta["result_type"] = "delete"
        return meta

    if tool_name in ("create_host", "update_host", "probe_managed_host"):
        meta["result_type"] = "json_host"
        return meta

    if tool_name.startswith("create_") or tool_name.startswith("update_"):
        meta["result_type"] = "crud_generic"
        return meta

    return meta


def _summarize_tool_args(tool_name: str, raw_json: str) -> dict[str, Any]:
    """Produce a compact summary of tool call arguments for the frontend."""
    try:
        args = json.loads(raw_json)
    except Exception:
        return {}

    def with_summary(d: dict[str, Any], summary: str) -> dict[str, Any]:
        out = {**d, "summary": summary}
        return out

    if tool_name in ("create_role", "update_role"):
        role = args.get("role", args)
        name = str(role.get("name", "") or "")
        desc = (role.get("description") or "")[:200]
        verb = "Create role" if tool_name == "create_role" else "Update role"
        return with_summary(
            {"name": name, "description": desc},
            f"{verb}: {name}" if name else verb,
        )
    if tool_name in ("create_playbook", "update_playbook"):
        pb = args.get("playbook", args)
        name = str(pb.get("name", "") or "")
        rc = len(pb.get("roles", []))
        verb = "Create playbook" if tool_name == "create_playbook" else "Update playbook"
        return with_summary(
            {"name": name, "role_count": rc},
            f"{verb}: {name} ({rc} roles)" if name else f"{verb} ({rc} roles)",
        )
    if tool_name == "get_role_detail":
        rid = str(args.get("role_id", ""))
        return with_summary({"role_id": rid}, f"Load role {rid}")
    if tool_name == "get_playbook":
        pid = str(args.get("playbook_id", ""))
        return with_summary({"playbook_id": pid}, f"Load playbook {pid}")
    if tool_name == "run_ssh_command":
        hid = str(args.get("host_id", ""))
        cmd = str(args.get("command", ""))
        short = cmd[:160] + ("…" if len(cmd) > 160 else "")
        return with_summary({"host_id": hid, "command": short}, f"SSH {hid}: {short}")
    if tool_name == "run_playbook":
        pid = str(args.get("playbook_id", ""))
        return with_summary({"playbook_id": pid}, f"Run playbook {pid}")
    if tool_name == "run_role":
        rid = str(args.get("role_id", ""))
        become = bool(args.get("become", False))
        return with_summary(
            {"role_id": rid, "become": become},
            f"Run role {rid}" + (" (become)" if become else ""),
        )
    if tool_name == "create_host":
        h = args.get("host", args) if isinstance(args.get("host"), dict) else args
        hn = str(h.get("name", "") or "")
        ip = str(h.get("ip_address", "") or "")
        return with_summary(
            {"name": hn, "ip": ip},
            f"Create host {hn}" + (f" @ {ip}" if ip else ""),
        )
    if tool_name == "update_host":
        hid = str(args.get("host_id", ""))
        return with_summary({"host_id": hid}, f"Update host {hid}")
    if tool_name == "delete_role":
        rid = str(args.get("role_id", ""))
        return with_summary({"role_id": rid}, f"Delete role {rid}")
    if tool_name == "delete_playbook":
        pid = str(args.get("playbook_id", ""))
        casc = bool(args.get("cascade_roles", False))
        return with_summary(
            {"playbook_id": pid, "cascade_roles": casc},
            f"Delete playbook {pid}" + (" (+ orphan roles)" if casc else ""),
        )
    if tool_name == "delete_host":
        hid = str(args.get("host_id", ""))
        return with_summary({"host_id": hid}, f"Delete host {hid}")
    if tool_name == "delete_group":
        gid = str(args.get("group_id", ""))
        return with_summary({"group_id": gid}, f"Delete group {gid}")
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
                    async with node.stream(run.ctx) as handle_stream:
                        async for tool_event in handle_stream:
                            if isinstance(tool_event, FunctionToolCallEvent):
                                name = tool_event.part.tool_name
                                if name.startswith(_RESULT_TOOL_PREFIX):
                                    continue
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
                                pair = _tool_result_for_sse(tool_event)
                                if pair is None:
                                    continue
                                tool_name, text = pair
                                meta = tool_result_ui_metadata(tool_name, text)
                                payload: dict[str, Any] = {
                                    "type": "tool_result",
                                    "tool": tool_name,
                                    "result": text[:2000],
                                    **{
                                        k: v
                                        for k, v in meta.items()
                                        if v is not None
                                        and k in (
                                            "result_type",
                                            "exit_code",
                                            "entity_id",
                                            "entity_name",
                                            "run_status",
                                        )
                                    },
                                }
                                yield _sse(payload)

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
                    async with node.stream(run.ctx) as handle_stream:
                        async for tool_event in handle_stream:
                            if isinstance(tool_event, FunctionToolCallEvent):
                                name = tool_event.part.tool_name
                                if name.startswith(_RESULT_TOOL_PREFIX):
                                    continue
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
                                pair2 = _tool_result_for_sse(tool_event)
                                if pair2 is None:
                                    continue
                                tool_name2, text2 = pair2
                                meta2 = tool_result_ui_metadata(tool_name2, text2)
                                payload2: dict[str, Any] = {
                                    "type": "tool_result",
                                    "tool": tool_name2,
                                    "result": text2[:2000],
                                    **{
                                        k: v
                                        for k, v in meta2.items()
                                        if v is not None
                                        and k in (
                                            "result_type",
                                            "exit_code",
                                            "entity_id",
                                            "entity_name",
                                            "run_status",
                                        )
                                    },
                                }
                                yield _sse(payload2)

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
