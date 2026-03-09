"""Host request/response schemas."""

from __future__ import annotations

from pydantic import BaseModel, Field


class HostPlacement(BaseModel):
    rack: str
    u_start: int = Field(ge=1, description="Rack unit position (1-based)")
    u_height: int = Field(default=1, ge=1, description="Height in rack units")
    col_start: int = Field(default=0, ge=0, description="Starting column index")
    col_count: int = Field(default=1, ge=1, description="Number of columns")


class HostInput(BaseModel):
    name: str = ""
    ip_address: str = ""
    ssh_user: str = ""
    ssh_port: int = 22
    managed: bool = True
    groups: list[str] = Field(default_factory=list)
    labels: list[str] = Field(default_factory=list)
    os_family: str | None = None
    notes: str = ""
    placement: HostPlacement | None = None


class Host(HostInput):
    id: str
    hostname: str = ""
    mac_address: str = ""


class HostSummary(BaseModel):
    id: str
    name: str
    hostname: str = ""
    ip_address: str
    managed: bool
    groups: list[str]
    labels: list[str]
