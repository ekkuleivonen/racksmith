"""Rack request/response schemas."""

from __future__ import annotations

from pydantic import BaseModel, Field

from hosts.schemas import Host


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


class RackLayout(Rack):
    hosts: list[Host] = Field(default_factory=list)
