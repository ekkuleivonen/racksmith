"""SSH command history stored in Redis."""

from __future__ import annotations

import json

from racksmith_shared.helpers import now_iso
from racksmith_shared.redis import AsyncRedis

import settings
from ssh.schemas import CommandHistoryEntry


def _history_key(user_id: str, host_id: str) -> str:
    return f"{settings.REDIS_SSH_HISTORY_PREFIX}:{user_id}:{host_id}"


async def load_history(user_id: str, host_id: str) -> list[CommandHistoryEntry]:
    raw = await AsyncRedis.get(_history_key(user_id, host_id))
    if not raw:
        return []
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return []
    return [CommandHistoryEntry.model_validate(entry) for entry in data]


async def record_command(
    user_id: str,
    host_id: str,
    host_name: str,
    ip_address: str,
    command: str,
) -> None:
    normalized = command.strip()
    if not normalized:
        return
    history = await load_history(user_id, host_id)
    history.append(
        CommandHistoryEntry(
            command=normalized,
            created_at=now_iso(),
            host_id=host_id,
            host_name=host_name,
            ip_address=ip_address,
        )
    )
    payload = json.dumps([entry.model_dump() for entry in history[-settings.SSH_HISTORY_LIMIT :]])
    await AsyncRedis.setex(_history_key(user_id, host_id), settings.SSH_HISTORY_TTL, payload)
