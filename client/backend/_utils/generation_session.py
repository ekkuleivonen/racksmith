"""Generation session persistence in Redis for AI playbook generation."""

from __future__ import annotations

import json

from _utils.redis import AsyncRedis

SESSION_KEY_PREFIX = "racksmith:playbook_gen:"
SESSION_TTL = 900  # 15 minutes


def _key(session_id: str) -> str:
    return f"{SESSION_KEY_PREFIX}{session_id}"


async def save_generation_session(session_id: str, state: dict) -> None:
    """Store generation session state as a JSON blob with TTL."""
    await AsyncRedis.setex(_key(session_id), SESSION_TTL, json.dumps(state))


async def load_generation_session(session_id: str) -> dict | None:
    """Load generation session from Redis. Returns None if expired/missing."""
    raw = await AsyncRedis.get(_key(session_id))
    if raw is None:
        return None
    return json.loads(raw)


async def refresh_generation_session(session_id: str) -> None:
    """Reset the TTL on an existing session."""
    await AsyncRedis.expire(_key(session_id), SESSION_TTL)
