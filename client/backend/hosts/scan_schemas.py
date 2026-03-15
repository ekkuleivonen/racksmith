"""Network discovery request/response schemas."""

from __future__ import annotations

from ipaddress import IPv4Network

from pydantic import BaseModel, Field, field_validator


class DiscoveredDevice(BaseModel):
    ip: str
    mac: str
    vendor: str = ""
    hostname: str = ""
    already_imported: bool = False
    existing_host_id: str | None = None


class ScanRequest(BaseModel):
    subnet: str | None = Field(
        default=None,
        description="CIDR subnet to scan, e.g. '192.168.1.0/24'. Auto-detected when omitted.",
    )

    @field_validator("subnet")
    @classmethod
    def validate_subnet(cls, v: str | None) -> str | None:
        if v is not None:
            try:
                IPv4Network(v, strict=False)
            except ValueError:
                raise ValueError(f"Invalid CIDR subnet: {v}")
        return v


class ScanResponse(BaseModel):
    scan_id: str


class ScanStatus(BaseModel):
    scan_id: str
    status: str = "pending"
    devices: list[DiscoveredDevice] = Field(default_factory=list)
    subnet: str = ""
    error: str | None = None
