"""Network discovery schemas."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class DiscoveredDevice(BaseModel):
    model_config = ConfigDict(extra="ignore")

    ip: str
    mac: str = ""
    hostname: str = ""
    already_imported: bool = False
    existing_host_id: str | None = None


class ScanStatus(BaseModel):
    scan_id: str
    status: str = "pending"
    devices: list[DiscoveredDevice] = Field(default_factory=list)
    subnet: str = ""
    error: str | None = None


class KnownHost(BaseModel):
    host_id: str
    ip: str = ""
    mac: str = ""
