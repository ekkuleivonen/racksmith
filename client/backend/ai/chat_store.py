"""Redis-backed persistence for AI chat threads (per user + active repo + chat id)."""

from __future__ import annotations

import json
import secrets
import time
from typing import Any

from pydantic_ai.messages import ModelMessage, ModelMessagesTypeAdapter, ToolCallPart
from pydantic_ai.tools import DeferredToolRequests

from _utils.exceptions import RepoNotAvailableError
from _utils.logging import get_logger
from _utils.redis import AsyncRedis
from auth.session import SessionData
from repo.managers import repos_manager

logger = get_logger(__name__)

CHAT_KEY_PREFIX = "rs:ai:chat:"
CHAT_TTL_SECONDS = 90 * 24 * 3600  # 90 days
MAX_SERIALIZED_BYTES = 450_000
_ta = ModelMessagesTypeAdapter


def _repo_segment(session: SessionData) -> str:
    binding = repos_manager.current_repo(session)
    if binding is None:
        raise RepoNotAvailableError("No active repository")
    return binding.full_name.replace("/", ":")


def _user_segment(session: SessionData) -> str:
    from auth.session import user_storage_id

    return user_storage_id(session.user)


def _chat_key(session: SessionData, chat_id: str) -> str:
    return f"{CHAT_KEY_PREFIX}{_user_segment(session)}:{_repo_segment(session)}:{chat_id}"


def _deferred_key(session: SessionData, chat_id: str) -> str:
    return f"{_chat_key(session, chat_id)}:deferred"


def _dump_tool_call_part(p: ToolCallPart) -> dict[str, Any]:
    return {
        "tool_name": p.tool_name,
        "args": p.args,
        "tool_call_id": p.tool_call_id,
        "part_kind": getattr(p, "part_kind", "tool-call"),
    }


def _load_tool_call_part(data: dict[str, Any]) -> ToolCallPart:
    tcid = data.get("tool_call_id")
    if not tcid:
        raise ValueError("tool_call_id required")
    return ToolCallPart(
        tool_name=str(data["tool_name"]),
        args=data.get("args"),
        tool_call_id=str(tcid),
    )


def deferred_requests_to_json(d: DeferredToolRequests) -> str:
    payload: dict[str, Any] = {
        "v": 1,
        "calls": [_dump_tool_call_part(p) for p in d.calls],
        "approvals": [_dump_tool_call_part(p) for p in d.approvals],
        "metadata": dict(d.metadata),
    }
    return json.dumps(payload)


def deferred_requests_from_json(raw: str) -> DeferredToolRequests | None:
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return None
    if not isinstance(data, dict) or data.get("v") != 1:
        return None
    calls_raw = data.get("calls") or []
    appr_raw = data.get("approvals") or []
    meta = data.get("metadata") or {}
    if not isinstance(calls_raw, list) or not isinstance(appr_raw, list):
        return None
    if not isinstance(meta, dict):
        meta = {}
    try:
        calls = [_load_tool_call_part(c) for c in calls_raw if isinstance(c, dict)]
        approvals = [_load_tool_call_part(c) for c in appr_raw if isinstance(c, dict)]
    except (KeyError, TypeError, ValueError):
        return None
    return DeferredToolRequests(calls=calls, approvals=approvals, metadata=meta)


class AiChatStore:
    async def create(self, session: SessionData) -> str:
        chat_id = secrets.token_urlsafe(16)
        key = _chat_key(session, chat_id)
        payload = json.dumps({"v": 1, "updated_at": time.time(), "items": []})
        await AsyncRedis.setex(key, CHAT_TTL_SECONDS, payload)
        return chat_id

    async def delete(self, session: SessionData, chat_id: str) -> bool:
        key = _chat_key(session, chat_id)
        dk = _deferred_key(session, chat_id)
        n_main = await AsyncRedis.delete(key)
        await AsyncRedis.delete(dk)
        return n_main > 0

    async def load_messages(self, session: SessionData, chat_id: str) -> list[ModelMessage] | None:
        raw = await AsyncRedis.get(_chat_key(session, chat_id))
        if not raw:
            return None
        try:
            data: dict[str, Any] = json.loads(raw)
        except json.JSONDecodeError:
            logger.warning("ai_chat_corrupt", chat_id=chat_id)
            return []
        items = data.get("items")
        if not isinstance(items, list):
            return []
        try:
            return _ta.validate_python(items)
        except Exception:
            logger.warning("ai_chat_messages_invalid", chat_id=chat_id, exc_info=True)
            return []

    async def save_messages(self, session: SessionData, chat_id: str, messages: list[ModelMessage]) -> None:
        dumped = _ta.dump_python(messages, mode="json")
        payload = json.dumps({"v": 1, "updated_at": time.time(), "items": dumped})
        if len(payload.encode("utf-8")) > MAX_SERIALIZED_BYTES:
            raise ValueError("Chat history too large; start a new chat.")
        key = _chat_key(session, chat_id)
        await AsyncRedis.setex(key, CHAT_TTL_SECONDS, payload)

    async def save_deferred(
        self, session: SessionData, chat_id: str, deferred: DeferredToolRequests
    ) -> None:
        dk = _deferred_key(session, chat_id)
        raw = deferred_requests_to_json(deferred)
        if len(raw.encode("utf-8")) > MAX_SERIALIZED_BYTES:
            raise ValueError("Deferred tool state too large.")
        await AsyncRedis.setex(dk, CHAT_TTL_SECONDS, raw)

    async def load_deferred(
        self, session: SessionData, chat_id: str
    ) -> DeferredToolRequests | None:
        raw = await AsyncRedis.get(_deferred_key(session, chat_id))
        if not raw:
            return None
        if isinstance(raw, bytes):
            raw = raw.decode("utf-8")
        return deferred_requests_from_json(raw)

    async def clear_deferred(self, session: SessionData, chat_id: str) -> None:
        await AsyncRedis.delete(_deferred_key(session, chat_id))


ai_chat_store = AiChatStore()
