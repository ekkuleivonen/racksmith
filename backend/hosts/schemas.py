"""Host request/response schemas."""

from __future__ import annotations

from pydantic import BaseModel, Field


class HostPlacement(BaseModel):
    rack: str
    u_start: int = Field(ge=1, description="Rack unit position (1-based)")
    u_height: int = Field(default=1, ge=1, description="Height in rack units")
    col_start: int = Field(default=0, ge=0, description="Starting column index")
    col_count: int = Field(default=1, ge=1, description="Number of columns")


class HostCreate(BaseModel):
    """Create host — required fields."""

    name: str = Field(min_length=1, max_length=120)
    ip_address: str = Field(default="", max_length=255)
    ssh_user: str = Field(default="", max_length=64)
    ssh_port: int = Field(default=22, ge=1, le=65535)
    managed: bool = True
    groups: list[str] = Field(default_factory=list)
    labels: list[str] = Field(default_factory=list)
    os_family: str | None = None
    notes: str = Field(default="", max_length=500)
    placement: HostPlacement | None = None


class HostUpdate(BaseModel):
    """Update host — all optional."""

    name: str | None = Field(default=None, max_length=120)
    ip_address: str | None = Field(default=None, max_length=255)
    ssh_user: str | None = Field(default=None, max_length=64)
    ssh_port: int | None = Field(default=None, ge=1, le=65535)
    managed: bool | None = None
    groups: list[str] | None = None
    labels: list[str] | None = None
    os_family: str | None = None
    notes: str | None = Field(default=None, max_length=500)
    placement: HostPlacement | None = None


class Host(BaseModel):
    """Full host response model with validated fields."""

    id: str
    name: str = Field(default="", max_length=120)
    hostname: str = ""
    ip_address: str = Field(default="", max_length=255)
    ssh_user: str = Field(default="", max_length=64)
    ssh_port: int = Field(default=22, ge=1, le=65535)
    managed: bool = True
    groups: list[str] = Field(default_factory=list)
    labels: list[str] = Field(default_factory=list)
    os_family: str | None = None
    notes: str = Field(default="", max_length=500)
    placement: HostPlacement | None = None
    mac_address: str = ""


class HostSummary(BaseModel):
    id: str
    name: str
    hostname: str = ""
    ip_address: str
    managed: bool
    groups: list[str]
    labels: list[str]
