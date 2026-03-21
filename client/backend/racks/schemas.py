"""Rack request/response schemas."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class RackCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    rack_width_inches: int = Field(ge=1, le=30)  # validated by racks.misc.validate_width (10, 19, 23)
    rack_units: int = Field(ge=1, le=52)
    rack_cols: int = Field(default=1, ge=1, le=48)


class RackUpdate(BaseModel):
    """Update rack — all optional, use None for unchanged fields."""

    name: str | None = Field(default=None, max_length=120)
    rack_width_inches: int | None = Field(default=None, ge=1, le=30)
    rack_units: int | None = Field(default=None, ge=1, le=52)
    rack_cols: int | None = Field(default=None, ge=1, le=48)


class Rack(BaseModel):
    id: str
    name: str
    rack_width_inches: int
    rack_units: int
    rack_cols: int
    created_at: str
    updated_at: str


class RackSummary(BaseModel):
    id: str
    name: str
    rack_width_inches: int
    rack_units: int
    rack_cols: int
    created_at: str


class RackLayoutHost(BaseModel):
    """Host on a rack with flat placement fields (layout API)."""

    model_config = ConfigDict(extra="ignore")

    id: str
    hostname: str = ""
    name: str = ""
    ip_address: str = ""
    ssh_user: str = ""
    ssh_port: int = 22
    managed: bool = True
    groups: list[str] = Field(default_factory=list)
    labels: list[str] = Field(default_factory=list)
    os_family: str | None = None
    mac_address: str = ""
    subnet: str | None = None
    vars: dict[str, Any] = Field(default_factory=dict)
    placement: Literal["rack"] = "rack"
    position_u_start: int = 1
    position_u_height: int = 1
    position_col_start: int = 0
    position_col_count: int = 1


class RackLayout(Rack):
    hosts: list[RackLayoutHost] = Field(default_factory=list)


class RackResponse(BaseModel):
    rack: Rack


class RackLayoutResponse(BaseModel):
    layout: RackLayout
