"""HTTP client for communicating with the daemon."""

from __future__ import annotations

from typing import Any

import httpx

import settings
from _utils.logging import get_logger

logger = get_logger(__name__)


def _base_url() -> str:
    return settings.DAEMON_URL.rstrip("/")


def _headers() -> dict[str, str]:
    h: dict[str, str] = {}
    if settings.DAEMON_SECRET:
        h["Authorization"] = f"Bearer {settings.DAEMON_SECRET}"
    return h


async def daemon_post(path: str, json: dict | None = None, timeout: float = 30.0) -> dict[str, Any]:
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{_base_url()}{path}",
            json=json,
            headers=_headers(),
            timeout=timeout,
        )
        resp.raise_for_status()
        return resp.json()


async def daemon_get(path: str, timeout: float = 10.0) -> dict[str, Any]:
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{_base_url()}{path}",
            headers=_headers(),
            timeout=timeout,
        )
        resp.raise_for_status()
        return resp.json()
