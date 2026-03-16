"""Playbook request/response schemas."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

from _utils.schemas import RoleInputSpec, RoleOutputSpec, RunStatus


class RoleCatalogEntry(BaseModel):
    id: str
    name: str
    description: str
    inputs: list[RoleInputSpec] = Field(default_factory=list)
    outputs: list[RoleOutputSpec] = Field(default_factory=list)
    labels: list[str] = Field(default_factory=list)


class PlaybookRoleEntry(BaseModel):
    role_id: str = Field(min_length=1, max_length=120)
    vars: dict[str, Any] = Field(default_factory=dict)


class PlaybookUpsert(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    description: str = Field(default="", max_length=500)
    roles: list[PlaybookRoleEntry] = Field(default_factory=list)
    become: bool = Field(default=False, description="Requires privilege escalation (sudo)")


class PlaybookSummary(BaseModel):
    id: str
    path: str
    name: str
    description: str = ""
    roles: list[str] = Field(default_factory=list)
    updated_at: str
    registry_id: str = ""
    registry_version: int = 0


class PlaybookDetail(PlaybookSummary):
    roles_catalog: list[RoleCatalogEntry] = Field(default_factory=list)
    role_entries: list[PlaybookRoleEntry] = Field(default_factory=list)
    raw_content: str
    become: bool = Field(default=False, description="Requires privilege escalation (sudo)")


class TargetSelection(BaseModel):
    groups: list[str] = Field(default_factory=list)
    labels: list[str] = Field(default_factory=list)
    hosts: list[str] = Field(default_factory=list)
    racks: list[str] = Field(default_factory=list)


class ResolveTargetsRequest(BaseModel):
    targets: TargetSelection


class ResolveTargetsResponse(BaseModel):
    hosts: list[str] = Field(default_factory=list)


class PlaybookRunRequest(BaseModel):
    targets: TargetSelection
    runtime_vars: dict[str, str] = Field(default_factory=dict)
    become_password: str | None = Field(default=None, description="Sudo password when playbook has become")


class PlaybookRun(BaseModel):
    id: str
    playbook_id: str
    playbook_name: str
    status: RunStatus
    created_at: str
    started_at: str | None = None
    finished_at: str | None = None
    exit_code: int | None = None
    hosts: list[str] = Field(default_factory=list)
    output: str = ""
    commit_sha: str | None = None


class PlaybookListResponse(BaseModel):
    playbooks: list[PlaybookSummary]
    roles: list[RoleCatalogEntry]


class PlaybookResponse(BaseModel):
    playbook: PlaybookDetail


class PlaybookRunResponse(BaseModel):
    run: PlaybookRun


# ---------------------------------------------------------------------------
# AI playbook generation
# ---------------------------------------------------------------------------


class PlaybookPlanRoleReuse(BaseModel):
    """Reuse an existing role from the catalog."""

    action: Literal["reuse"]
    role_id: str
    vars: dict[str, Any] = Field(default_factory=dict)


class PlaybookPlanRoleCreate(BaseModel):
    """Create a brand-new role via an LLM sub-agent."""

    action: Literal["create"]
    name: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=500)
    generation_prompt: str = Field(min_length=1)
    expected_inputs: list[RoleInputSpec] = Field(default_factory=list)
    expected_outputs: list[RoleOutputSpec] = Field(default_factory=list)
    vars: dict[str, Any] = Field(default_factory=dict)


class PlaybookPlan(BaseModel):
    """LLM-generated playbook plan before role sub-agents run."""

    name: str = Field(min_length=1, max_length=160)
    description: str = Field(default="", max_length=500)
    become: bool = False
    roles: list[PlaybookPlanRoleReuse | PlaybookPlanRoleCreate] = Field(min_length=1)


class GeneratePlaybookRequest(BaseModel):
    prompt: str = Field(min_length=1)
    generation_session_id: str | None = None
