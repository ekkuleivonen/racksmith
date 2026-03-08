"""Action manifest schema for actions/<slug>/action.yaml."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class ActionInputConfig(BaseModel):
    """Schema for an action input (Ansible variable)."""

    key: str = Field(description="Ansible variable name")
    label: str = Field(description="Display label in the UI")
    type: Literal["string", "boolean", "select", "secret"] = Field(default="string")
    placeholder: str = Field(default="")
    default: Any = Field(default=None)
    required: bool = Field(default=False)
    options: list[str] = Field(default_factory=list, description="Values for type=select")
    interactive: bool = Field(
        default=False,
        description="If True, value is never stored — always prompted at run time",
    )


class ActionCompatibility(BaseModel):
    """OS compatibility for an action."""

    os_family: list[str] = Field(default_factory=list, description="Empty list = any OS")


class ActionConfig(BaseModel):
    """Schema for actions/<slug>/action.yaml."""

    slug: str = Field(description="Unique identifier, matches directory name")
    name: str = Field(description="Display name")
    description: str = Field(default="")
    executor: Literal["ansible"] = Field(default="ansible")
    source: Literal["builtin", "user", "community"] = Field(default="user")
    inputs: list[ActionInputConfig] = Field(default_factory=list)
    labels: list[str] = Field(default_factory=list, description="Freeform category tags")
    compatibility: ActionCompatibility = Field(default_factory=ActionCompatibility)
