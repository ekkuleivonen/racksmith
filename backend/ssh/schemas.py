"""SSH schemas."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel


class CommandHistoryEntry(BaseModel):
    command: str
    created_at: str
    item_id: str
    item_name: str
    host: str


class PingStatusTarget(BaseModel):
    rack_id: str
    item_id: str


class PingStatusRequest(BaseModel):
    targets: list[PingStatusTarget]


class PingStatusEntry(BaseModel):
    rack_id: str
    item_id: str
    status: Literal["online", "offline", "unknown"]
