"""Group request/response schemas."""

from __future__ import annotations

from pydantic import BaseModel, Field

from hosts.schemas import HostSummary


class GroupInput(BaseModel):
    name: str = ""
    description: str = ""


class Group(GroupInput):
    id: str


class GroupWithMembers(Group):
    hosts: list[HostSummary] = Field(default_factory=list)
