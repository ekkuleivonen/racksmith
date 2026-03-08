"""Request/response schemas for the actions API."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

from stacks.schemas import StackTargetSelection

RunStatus = Literal["queued", "running", "completed", "failed"]


class ActionCreateRequest(BaseModel):
    """Single YAML declaration format.

    The `tasks` key is extracted and written to tasks/main.yml.
    Everything else is written to action.yaml.
    """

    slug: str = Field(description="Unique identifier — becomes the directory name")
    name: str
    description: str = ""
    inputs: list[dict[str, Any]] = Field(default_factory=list)
    labels: list[str] = Field(default_factory=list)
    compatibility: dict[str, Any] = Field(default_factory=lambda: {"os_family": []})
    tasks: list[Any] = Field(
        default_factory=list,
        description="Ansible task list written to tasks/main.yml",
    )


class ActionFromYamlRequest(BaseModel):
    yaml_text: str = Field(description="Raw YAML combining action.yaml fields + tasks list")


class ActionUpdateRequest(BaseModel):
    """Update an action via raw YAML (same format as create)."""

    yaml_text: str = Field(description="Raw YAML combining action.yaml fields + tasks list")


class ActionResponse(BaseModel):
    slug: str
    name: str
    description: str
    inputs: list[dict[str, Any]]
    labels: list[str] = Field(default_factory=list)
    compatibility: dict[str, Any]
    has_tasks: bool


class ActionDetailResponse(ActionResponse):
    raw_content: str = ""
    tasks_content: str = ""


class ActionRunRequest(BaseModel):
    targets: StackTargetSelection
    vars: dict[str, Any] = Field(default_factory=dict)
    become: bool = False
    become_password: str | None = None
    runtime_vars: dict[str, str] = Field(default_factory=dict)


class ActionRun(BaseModel):
    id: str
    action_slug: str
    action_name: str
    status: RunStatus
    created_at: str
    started_at: str | None = None
    finished_at: str | None = None
    exit_code: int | None = None
    hosts: list[str] = Field(default_factory=list)
    output: str = ""
    vars: dict[str, Any] = Field(default_factory=dict)
    become: bool = False
    commit_sha: str | None = None
