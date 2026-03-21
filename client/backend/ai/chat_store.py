"""Redis-backed persistence for AI chat threads (per user + active repo + chat id)."""

from __future__ import annotations

import json
import secrets
import time
from typing import Any

from pydantic_ai.messages import ModelMessage, ModelMessagesTypeAdapter

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


class AiChatStore:
    async def create(self, session: SessionData) -> str:
        chat_id = secrets.token_urlsafe(16)
        key = _chat_key(session, chat_id)
        payload = json.dumps({"v": 1, "updated_at": time.time(), "items": []})
        await AsyncRedis.setex(key, CHAT_TTL_SECONDS, payload)
        return chat_id

    async def delete(self, session: SessionData, chat_id: str) -> bool:
        n = await AsyncRedis.delete(_chat_key(session, chat_id))
        return n > 0

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


ai_chat_store = AiChatStore()
