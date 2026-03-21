"""ICMP ping with caching."""

from __future__ import annotations

import asyncio
from contextlib import suppress

from racksmith_shared.redis import AsyncRedis

import settings


def _ping_cache_key(ip: str) -> str:
    return f"{settings.REDIS_PING_CACHE_PREFIX}{ip}"


async def ping_host(ip: str) -> bool:
    cached = await AsyncRedis.get(_ping_cache_key(ip))
    if cached is not None:
        return cached == "1"

    process = await asyncio.create_subprocess_exec(
        "ping", "-c", "1", "-W", "1", ip,
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.DEVNULL,
    )
    try:
        await asyncio.wait_for(process.wait(), timeout=2)
    except TimeoutError:
        with suppress(ProcessLookupError):
            process.kill()
        with suppress(ProcessLookupError):
            await process.wait()
        reachable = False
    else:
        reachable = process.returncode == 0

    await AsyncRedis.setex(_ping_cache_key(ip), settings.PING_CACHE_TTL, "1" if reachable else "0")
    return reachable


async def ping_hosts(ips: list[str]) -> dict[str, bool]:
    tasks = {ip: asyncio.create_task(ping_host(ip)) for ip in set(ips)}
    results: dict[str, bool] = {}
    for ip, task in tasks.items():
        results[ip] = await task
    return results
