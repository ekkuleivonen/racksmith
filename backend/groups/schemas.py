"""Group request/response schemas."""

from __future__ import annotations

from pydantic import BaseModel, Field

from hosts.schemas import HostSummary


class GroupCreate(BaseModel):
    """Create group — required name."""

    name: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=500)


class GroupUpdate(BaseModel):
    """Update group — all optional."""

    name: str | None = Field(default=None, max_length=120)
    description: str | None = Field(default=None, max_length=500)


class GroupInput(BaseModel):
    """Legacy input — prefer GroupCreate/GroupUpdate."""

    name: str = ""
    description: str = ""


class Group(GroupInput):
    id: str


class GroupWithMembers(Group):
    hosts: list[HostSummary] = Field(default_factory=list)
