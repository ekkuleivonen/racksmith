"""Shared WebSocket streaming for run output via Redis pub/sub."""

from __future__ import annotations

import json
from collections.abc import Awaitable, Callable
from typing import Any

import redis.asyncio as aioredis
from racksmith_shared import settings_base
from racksmith_shared.runs import run_events_channel


async def stream_run(
    run_id: str,
    websocket: Any,
    load_run: Callable[[str], Awaitable[Any | None]],
) -> None:
    """Stream live run output over a WebSocket.

    *load_run* should accept a run_id and return a pydantic model with
    ``.status`` and ``.model_dump()``, or ``None`` if not found.
    """
    run = await load_run(run_id)
    if run is None:
        await websocket.send_json({"type": "error", "message": "Run not found or expired"})
        return
    if run.status in ("completed", "failed"):
        await websocket.send_json(
            {"type": "snapshot", "run": run.model_dump(), "done": True}
        )
        return

    channel = run_events_channel(run_id)
    redis_client = aioredis.from_url(settings_base.REDIS_URL, decode_responses=True)
    pubsub = redis_client.pubsub()
    try:
        await pubsub.subscribe(channel)
        await websocket.send_json({"type": "snapshot", "run": run.model_dump()})
        while True:
            message = await pubsub.get_message(
                ignore_subscribe_messages=True, timeout=5.0
            )
            if message is None:
                run = await load_run(run_id)
                if run and run.status in ("completed", "failed"):
                    await websocket.send_json(
                        {"type": "snapshot", "run": run.model_dump(), "done": True}
                    )
                    break
                continue
            if message["type"] != "message":
                continue
            payload = json.loads(message["data"])
            if payload.get("type") == "output":
                await websocket.send_json(payload)
            elif payload.get("type") == "status":
                run = await load_run(run_id)
                if run:
                    await websocket.send_json(
                        {"type": "status", "run": run.model_dump()}
                    )
            elif payload.get("type") == "done":
                run = await load_run(run_id)
                if run:
                    await websocket.send_json(
                        {"type": "snapshot", "run": run.model_dump(), "done": True}
                    )
                break
    finally:
        await pubsub.unsubscribe(channel)
        await redis_client.aclose()
