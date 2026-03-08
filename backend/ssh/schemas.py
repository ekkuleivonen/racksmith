"""SSH schemas."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel


class CommandHistoryEntry(BaseModel):
    command: str
    created_at: str
    node_id: str
    node_name: str
    ip_address: str


class PingStatusTarget(BaseModel):
    node_id: str


class PingStatusRequest(BaseModel):
    targets: list[PingStatusTarget]


class PingStatusEntry(BaseModel):
    node_id: str
    status: Literal["online", "offline", "unknown"]
