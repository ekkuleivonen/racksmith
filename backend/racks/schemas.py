"""Rack request/response schemas."""

from __future__ import annotations

from pydantic import BaseModel, Field

from nodes.schemas import Node


class RackCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    rack_width_inches: int
    rack_units: int = Field(ge=1, le=52)
    rack_cols: int = 0


class RackUpdate(BaseModel):
    name: str = Field(default="", max_length=120)
    rack_width_inches: int = 0
    rack_units: int = Field(default=0, ge=0, le=52)
    rack_cols: int = Field(default=0, ge=0, le=48)


class Rack(BaseModel):
    slug: str
    name: str
    rack_width_inches: int
    rack_units: int
    rack_cols: int
    created_at: str
    updated_at: str


class RackSummary(BaseModel):
    slug: str
    name: str
    rack_width_inches: int
    rack_units: int
    rack_cols: int
    created_at: str


class RackLayout(Rack):
    nodes: list[Node] = Field(default_factory=list)
