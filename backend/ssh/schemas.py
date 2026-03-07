"""SSH schemas."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel


class CommandHistoryEntry(BaseModel):
    command: str
    created_at: str
    node_slug: str
    node_name: str
    host: str


class PingStatusTarget(BaseModel):
    node_slug: str


class PingStatusRequest(BaseModel):
    targets: list[PingStatusTarget]


class PingStatusEntry(BaseModel):
    node_slug: str
    status: Literal["online", "offline", "unknown"]
