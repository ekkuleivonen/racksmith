"""Group request/response schemas."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field

from hosts.schemas import HostSummary


class GroupCreate(BaseModel):
    """Create group — required name."""

    name: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=500)
    vars: dict[str, Any] = Field(default_factory=dict)


class GroupUpdate(BaseModel):
    """Update group — all optional."""

    name: str | None = Field(default=None, max_length=120)
    description: str | None = Field(default=None, max_length=500)
    vars: dict[str, Any] | None = None


class Group(BaseModel):
    id: str
    name: str = ""
    description: str = ""
    vars: dict[str, Any] = Field(default_factory=dict)


class GroupWithMembers(Group):
    hosts: list[HostSummary] = Field(default_factory=list)


class GroupResponse(BaseModel):
    group: Group


class GroupCreateResponse(BaseModel):
    group: Group
    group_id: str


class GroupWithMembersResponse(BaseModel):
    group: GroupWithMembers


class GroupListResponse(BaseModel):
    groups: list[Group]
