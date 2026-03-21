"""arq WorkerSettings for the daemon worker."""

from __future__ import annotations

from arq.connections import RedisSettings
from redis.asyncio import Redis

import settings
from ansible.collections import install_ansible_collections_on_startup
from ansible.runner import execute_playbook_run, execute_role_run
from discovery.scanner import execute_network_scan

REDIS_SETTINGS = RedisSettings.from_dsn(settings.REDIS_URL)


async def _on_startup(ctx: dict) -> None:
    await install_ansible_collections_on_startup()
    ctx["redis"] = Redis.from_url(settings.REDIS_URL, decode_responses=True)


async def _on_shutdown(ctx: dict) -> None:
    if "redis" in ctx:
        await ctx["redis"].aclose()


class WorkerSettings:
    """arq worker configuration. CLI: arq worker.settings.WorkerSettings"""

    functions = [execute_playbook_run, execute_role_run, execute_network_scan]
    redis_settings = REDIS_SETTINGS
    max_jobs = 10
    job_timeout = 3600
    on_startup = _on_startup
    on_shutdown = _on_shutdown
