"""Run state persistence in Redis (playbook/role execution tracking)."""

from __future__ import annotations

from _utils.redis import AsyncRedis

RUN_KEY_PREFIX = "racksmith:run:"
RUN_TTL = 3600


def run_key(run_id: str) -> str:
    return f"{RUN_KEY_PREFIX}{run_id}"


async def save_run(run_id: str, data: dict[str, str]) -> None:
    """Store run state as a Redis hash with TTL."""
    key = run_key(run_id)
    await AsyncRedis.hset_mapping(key, data)
    await AsyncRedis.expire(key, RUN_TTL)


async def load_run(run_id: str) -> dict[str, str] | None:
    """Load run state from Redis. Returns None if expired/missing."""
    data = await AsyncRedis.hgetall(run_key(run_id))
    return data or None
