"""Request/response schemas for the roles API."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator

from playbooks.schemas import TargetSelection

RunStatus = Literal["queued", "running", "completed", "failed"]


class RoleCreateRequest(BaseModel):
    """Single YAML declaration format.

    The `tasks` key is extracted and written to tasks/main.yml.
    Everything else is written to meta/main.yml via ansible.roles.
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

    @model_validator(mode="after")
    def validate_inputs(self) -> "RoleCreateRequest":
        for index, inp in enumerate(self.inputs):
            if not isinstance(inp, dict):
                continue

            key = str(inp.get("key") or f"inputs[{index}]")
            has_default = "default" in inp and inp.get("default") is not None
            is_required = bool(inp.get("required", False))

            if has_default and is_required:
                raise ValueError(
                    f"Input '{key}' cannot set both required=true and a default value"
                )

        return self


class RoleFromYamlRequest(BaseModel):
    yaml_text: str = Field(
        description="Raw YAML combining role metadata + tasks list"
    )


class RoleUpdateRequest(BaseModel):
    """Update a role via raw YAML (same format as create)."""

    yaml_text: str = Field(
        description="Raw YAML combining role metadata + tasks list"
    )


class RoleSummary(BaseModel):
    slug: str
    name: str
    description: str
    inputs: list[dict[str, Any]]
    labels: list[str] = Field(default_factory=list)
    compatibility: dict[str, Any]
    has_tasks: bool


class RoleDetail(RoleSummary):
    raw_content: str = ""
    tasks_content: str = ""


class RoleRunRequest(BaseModel):
    targets: TargetSelection
    vars: dict[str, Any] = Field(default_factory=dict)
    become: bool = False
    become_password: str | None = None
    runtime_vars: dict[str, str] = Field(default_factory=dict)


class RoleRun(BaseModel):
    id: str
    role_slug: str
    role_name: str
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
