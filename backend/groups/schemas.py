"""Group request/response schemas."""

from __future__ import annotations

from pydantic import BaseModel, Field

from nodes.schemas import NodeSummary


class GroupInput(BaseModel):
    name: str = ""
    description: str = ""


class Group(GroupInput):
    slug: str


class GroupWithMembers(Group):
    nodes: list[NodeSummary] = Field(default_factory=list)
