"""Request/response schemas for the roles API."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field

from _utils.schemas import RoleInputSpec, RoleOutputSpec, RunStatus
from playbooks.schemas import TargetSelection


class RoleCreate(BaseModel):
    """Single YAML declaration format.

    The `tasks` key is extracted and written to tasks/main.yml.
    Everything else is written to meta/main.yml via ansible.roles.
    """

    name: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=500)
    inputs: list[RoleInputSpec] = Field(default_factory=list)
    outputs: list[RoleOutputSpec] = Field(default_factory=list)
    labels: list[str] = Field(default_factory=list)
    compatibility: dict[str, Any] = Field(default_factory=lambda: {"os_family": []})
    tasks: list[Any] = Field(
        default_factory=list,
        description="Ansible task list written to tasks/main.yml",
    )


class RoleFromYaml(BaseModel):
    yaml_text: str = Field(
        description="Raw YAML combining role metadata + tasks list"
    )


class RoleUpdate(BaseModel):
    """Update a role via raw YAML (same format as create)."""

    yaml_text: str = Field(
        description="Raw YAML combining role metadata + tasks list"
    )


class RoleSummary(BaseModel):
    id: str
    name: str
    description: str
    inputs: list[RoleInputSpec]
    outputs: list[RoleOutputSpec] = Field(default_factory=list)
    labels: list[str] = Field(default_factory=list)
    compatibility: dict[str, Any]
    has_tasks: bool
    registry_id: str = ""
    registry_version: int = 0


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
    role_id: str
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


class GenerateRequest(BaseModel):
    prompt: str


class EditGenerateRequest(BaseModel):
    existing_yaml: str
    prompt: str


class RoleResponse(BaseModel):
    role: RoleSummary


class RoleDetailResponse(BaseModel):
    role: RoleDetail


class RoleFromYamlResponse(BaseModel):
    role: RoleSummary


class RoleListResponse(BaseModel):
    roles: list[RoleSummary]


class RoleRunResponse(BaseModel):
    run: RoleRun
