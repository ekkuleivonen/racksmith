"""Rack config schema for racks/<slug>.yaml."""

from __future__ import annotations

from pydantic import BaseModel, Field


class RackConfig(BaseModel):
    """Schema for rack visual dimensions. Layout is assembled from nodes at query time."""

    slug: str = Field(description="Human-readable identifier, matches filename stem")
    name: str = Field(description="Display name for the rack")
    rack_units: int = Field(ge=1, le=52, description="Total rack units (height)")
    rack_width_inches: int = Field(description="Rack width in inches (10 or 19)")
    rack_cols: int = Field(ge=1, le=48, description="Number of columns")
    created_at: str = Field(default="", description="ISO timestamp when created")
    updated_at: str = Field(default="", description="ISO timestamp when last updated")
