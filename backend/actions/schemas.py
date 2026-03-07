"""Request/response schemas for the actions API."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class ActionCreateRequest(BaseModel):
    """Single YAML declaration format.

    The `tasks` key is extracted and written to tasks/main.yml.
    Everything else is written to action.yaml.
    """

    slug: str = Field(description="Unique identifier — becomes the directory name")
    name: str
    description: str = ""
    executor: str = "ansible"
    source: str = "user"
    inputs: list[dict[str, Any]] = Field(default_factory=list)
    compatibility: dict[str, Any] = Field(default_factory=lambda: {"os_family": []})
    tasks: list[Any] = Field(
        default_factory=list,
        description="Ansible task list written to tasks/main.yml",
    )


class ActionFromYamlRequest(BaseModel):
    yaml_text: str = Field(description="Raw YAML combining action.yaml fields + tasks list")


class ActionResponse(BaseModel):
    slug: str
    name: str
    description: str
    source: str
    inputs: list[dict[str, Any]]
    compatibility: dict[str, Any]
    has_tasks: bool
