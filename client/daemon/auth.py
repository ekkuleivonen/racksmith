"""Daemon authentication — shared secret between API and daemon."""

from __future__ import annotations

from fastapi import Header, HTTPException

import settings


async def verify_daemon_token(authorization: str = Header(...)) -> None:
    if not settings.DAEMON_SECRET:
        return
    if authorization != f"Bearer {settings.DAEMON_SECRET}":
        raise HTTPException(401, "Invalid daemon token")
