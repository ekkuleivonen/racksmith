"""Rack request/response schemas."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field
from racks.misc import HardwareType, OperatingSystem


RackPlacement = Literal["rack", "parked"]


# ---------------------------------------------------------------------------
# Items
# ---------------------------------------------------------------------------


class RackItemInput(BaseModel):
    placement: RackPlacement = "rack"
    managed: bool = True
    name: str = ""
    position_u_start: int = Field(ge=1)
    position_u_height: int = Field(ge=1)
    position_col_start: int = Field(ge=0)
    position_col_count: int = Field(ge=1)
    host: str = ""
    hardware_type: HardwareType = ""
    os: OperatingSystem = ""
    ssh_user: str = ""
    ssh_port: int = 22
    tags: list[str] = Field(default_factory=list)


class RackItem(RackItemInput):
    id: str
    mac_address: str = ""


class RackItemPreviewRequest(RackItemInput):
    item_id: str = Field(min_length=1, max_length=120)
    rack_units: int = Field(ge=1, le=52)
    rack_cols: int = Field(ge=1, le=48)


# ---------------------------------------------------------------------------
# Racks
# ---------------------------------------------------------------------------


class RackCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    rack_width_inches: int
    rack_units: int = Field(ge=1, le=52)
    rack_cols: int = 0
    items: list[RackItemInput] = Field(default_factory=list)


class RackUpdate(BaseModel):
    name: str = Field(default="", max_length=120)
    rack_width_inches: int = 0
    rack_units: int = Field(default=0, ge=0, le=52)
    rack_cols: int = Field(default=0, ge=0, le=48)
    park_all_items: bool = False


class Rack(BaseModel):
    id: str
    name: str
    rack_width_inches: int
    rack_units: int
    rack_cols: int
    created_at: str
    updated_at: str
    items: list[RackItem] = Field(default_factory=list)


class RackSummary(BaseModel):
    id: str
    name: str
    rack_width_inches: int
    rack_units: int
    rack_cols: int
    item_count: int
    created_at: str
