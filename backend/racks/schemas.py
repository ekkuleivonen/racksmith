"""Rack request/response schemas."""

from __future__ import annotations

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Items
# ---------------------------------------------------------------------------


class RackItemInput(BaseModel):
    name: str | None = None
    position_u_start: int = Field(ge=1)
    position_u_height: int = Field(ge=1)
    position_col_start: int = Field(ge=0)
    position_col_count: int = Field(ge=1)
    has_no_ip: bool = False
    ip_address: str | None = None


class RackItem(RackItemInput):
    id: str


# ---------------------------------------------------------------------------
# Racks
# ---------------------------------------------------------------------------


class RackCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    rack_width_inches: int
    rack_units: int = Field(ge=1, le=52)
    rack_cols: int | None = None
    items: list[RackItemInput] = Field(default_factory=list)


class RackUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    rack_units: int | None = Field(default=None, ge=1, le=52)
    rack_cols: int | None = Field(default=None, ge=1, le=48)


class Rack(BaseModel):
    id: str
    name: str
    owner_login: str
    rack_width_inches: int
    rack_units: int
    rack_cols: int
    created_at: str
    updated_at: str
    synced_at: str | None = None
    github_repo: str | None = None
    items: list[RackItem] = Field(default_factory=list)


class RackSummary(BaseModel):
    id: str
    name: str
    rack_width_inches: int
    rack_units: int
    rack_cols: int
    item_count: int
    created_at: str
    synced_at: str | None = None
    github_repo: str | None = None
