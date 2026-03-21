"""Host request/response schemas."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class HostPlacement(BaseModel):
    rack: str
    u_start: int = Field(ge=1, description="Rack unit position (1-based)")
    u_height: int = Field(default=1, ge=1, description="Height in rack units")
    col_start: int = Field(default=0, ge=0, description="Starting column index")
    col_count: int = Field(default=1, ge=1, description="Number of columns")


class HostCreate(BaseModel):
    """Create host — required fields."""

    name: str = Field(default="", max_length=120)
    ip_address: str = Field(default="", max_length=255)
    ssh_user: str = Field(default="", max_length=64)
    ssh_port: int = Field(default=22, ge=1, le=65535)
    managed: bool = True
    groups: list[str] = Field(default_factory=list)
    labels: list[str] = Field(default_factory=list)
    os_family: str | None = None
    mac_address: str = Field(default="", max_length=64)
    placement: HostPlacement | None = None
    vars: dict[str, Any] = Field(default_factory=dict)


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
    placement: HostPlacement | None = None
    vars: dict[str, Any] | None = None


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
    placement: HostPlacement | None = None
    mac_address: str = ""
    subnet: str | None = Field(
        default=None, description="Configured subnet CIDR containing this host IP, if any"
    )
    vars: dict[str, Any] = Field(default_factory=dict)


class HostSummary(BaseModel):
    id: str
    name: str
    hostname: str = ""
    ip_address: str
    managed: bool
    groups: list[str]
    labels: list[str]


class HostResponse(BaseModel):
    host: Host


class BulkAddToGroupRequest(BaseModel):
    host_ids: list[str] = Field(min_length=1)
    group_id: str = Field(min_length=1, max_length=120)


class BulkAddToGroupResponse(BaseModel):
    updated: int


class BulkAddLabelRequest(BaseModel):
    host_ids: list[str] = Field(min_length=1)
    label: str = Field(min_length=1, max_length=120)


class BulkAddLabelResponse(BaseModel):
    updated: int


class BulkHostCreateRequest(BaseModel):
    hosts: list[HostCreate] = Field(min_length=1)


class BulkHostCreateResponse(BaseModel):
    hosts: list[Host]


class BulkImportDiscoveredDevice(BaseModel):
    ip: str = Field(min_length=1, max_length=255)
    mac: str | None = Field(default=None, max_length=64)
    hostname: str | None = Field(default=None, max_length=255)


class BulkImportDiscoveredRequest(BaseModel):
    devices: list[BulkImportDiscoveredDevice] = Field(min_length=1)
    ssh_user: str = Field(min_length=1, max_length=64)
    ssh_port: int = Field(default=22, ge=1, le=65535)


class RelocateRequest(BaseModel):
    subnet: str | None = None


class RelocateResponse(BaseModel):
    host: Host
    previous_ip: str
    new_ip: str
    changed: bool
