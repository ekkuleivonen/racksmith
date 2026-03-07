"""arq WorkerSettings for the playbook execution worker."""

from __future__ import annotations

import settings
from arq.connections import RedisSettings
from redis.asyncio import Redis

from worker.functions import execute_run

REDIS_SETTINGS = RedisSettings.from_dsn(settings.REDIS_URL)


async def _on_startup(ctx: dict) -> None:
    ctx["redis"] = Redis.from_url(settings.REDIS_URL, decode_responses=True)


async def _on_shutdown(ctx: dict) -> None:
    if "redis" in ctx:
        await ctx["redis"].aclose()


class WorkerSettings:
    """arq worker configuration. Pass to CLI: arq worker.settings.WorkerSettings"""

    functions = [execute_run]
    redis_settings = REDIS_SETTINGS
    max_jobs = 10
    on_startup = _on_startup
    on_shutdown = _on_shutdown
