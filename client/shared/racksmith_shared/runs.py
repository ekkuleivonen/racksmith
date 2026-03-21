"""Run state persistence in Redis (playbook/role execution tracking)."""

from __future__ import annotations

from racksmith_shared.redis import AsyncRedis
from racksmith_shared.settings_base import REDIS_RUN_EVENTS_PREFIX

RUN_KEY_PREFIX = "racksmith:run:"
RUN_TTL = 3600


def run_key(run_id: str) -> str:
    return f"{RUN_KEY_PREFIX}{run_id}"


def run_events_channel(run_id: str) -> str:
    return f"{REDIS_RUN_EVENTS_PREFIX}{run_id}:events"


async def save_run(run_id: str, data: dict[str, str]) -> None:
    key = run_key(run_id)
    await AsyncRedis.hset_mapping(key, data)
    await AsyncRedis.expire(key, RUN_TTL)


async def load_run(run_id: str) -> dict[str, str] | None:
    data = await AsyncRedis.hgetall(run_key(run_id))
    return data or None
