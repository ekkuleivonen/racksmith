"""Stack manifest schema for stacks/<slug>.yml."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field, RootModel


class StackPlay(BaseModel):
    """One Ansible play block that makes up a stack."""

    name: str = Field(description="Display name of the stack")
    hosts: str = Field(default="all", description="Target hosts pattern")
    gather_facts: bool = Field(default=True)
    become: bool = Field(
        default=False,
        description="Run tasks with privilege escalation (sudo)",
    )
    roles: list[Any] = Field(
        default_factory=list,
        description="Ordered list of action slugs or {role: slug, vars: {…}} entries",
    )
    vars: dict[str, Any] = Field(
        default_factory=dict,
        description="Play-level variables; racksmith_description is reserved for the stack description",
    )


class StackConfig(RootModel[list[StackPlay]]):
    """Schema for .racksmith/stacks/<slug>.yml.

    A stack file is a single-element YAML list containing one Ansible play
    that references one or more actions (roles) in execution order.
    """
