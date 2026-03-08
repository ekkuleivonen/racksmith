"""Node request/response schemas."""

from __future__ import annotations

from pydantic import BaseModel, Field


class NodePlacement(BaseModel):
    rack: str
    u_start: int = Field(ge=1, description="Rack unit position (1-based)")
    u_height: int = Field(default=1, ge=1, description="Height in rack units")
    col_start: int = Field(default=0, ge=0, description="Starting column index")
    col_count: int = Field(default=1, ge=1, description="Number of columns")


class NodeInput(BaseModel):
    name: str = ""
    host: str = ""
    ssh_user: str = ""
    ssh_port: int = 22
    managed: bool = True
    groups: list[str] = Field(default_factory=list)
    labels: list[str] = Field(default_factory=list)
    os_family: str | None = None
    notes: str = ""
    placement: NodePlacement | None = None


class Node(NodeInput):
    id: str
    hostname: str = ""
    mac_address: str = ""


class NodeSummary(BaseModel):
    id: str
    name: str
    hostname: str = ""
    host: str
    managed: bool
    groups: list[str]
    labels: list[str]
    reachable: bool | None = None
