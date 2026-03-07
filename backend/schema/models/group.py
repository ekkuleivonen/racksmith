"""Group config schema for groups/<slug>.yaml."""

from __future__ import annotations

from pydantic import BaseModel, Field


class GroupConfig(BaseModel):
    """Schema for group metadata. Membership is derived from nodes at query time."""

    slug: str = Field(description="Human-readable identifier, matches filename stem")
    name: str = Field(description="Display name for the group")
    description: str = Field(default="", description="Optional description")
