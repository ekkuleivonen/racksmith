"""Stack request/response schemas."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


RunStatus = Literal["queued", "running", "completed", "failed"]


class ActionInput(BaseModel):
    key: str
    label: str
    placeholder: str = ""
    default: Any | None = None
    type: Literal["string", "boolean", "select", "secret"] = "string"
    options: list[str] = Field(default_factory=list)
    interactive: bool = False


class Action(BaseModel):
    slug: str
    name: str
    description: str
    inputs: list[ActionInput] = Field(default_factory=list)
    labels: list[str] = Field(default_factory=list)


class StackRoleInput(BaseModel):
    action_slug: str = Field(min_length=1, max_length=120)
    vars: dict[str, Any] = Field(default_factory=dict)


class StackUpsertRequest(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    description: str = Field(default="", max_length=500)
    roles: list[StackRoleInput] = Field(default_factory=list)


class StackSummary(BaseModel):
    id: str
    path: str
    name: str
    description: str = ""
    roles: list[str] = Field(default_factory=list)
    updated_at: str


class StackDetail(StackSummary):
    actions: list[Action] = Field(default_factory=list)
    role_entries: list[StackRoleInput] = Field(default_factory=list)
    raw_content: str


class StackTargetSelection(BaseModel):
    groups: list[str] = Field(default_factory=list)
    labels: list[str] = Field(default_factory=list)
    nodes: list[str] = Field(default_factory=list)
    racks: list[str] = Field(default_factory=list)


class StackResolveTargetsRequest(BaseModel):
    targets: StackTargetSelection


class StackResolveTargetsResponse(BaseModel):
    hosts: list[str] = Field(default_factory=list)


class StackRunRequest(BaseModel):
    targets: StackTargetSelection
    runtime_vars: dict[str, str] = Field(default_factory=dict)
    become: bool = False
    become_password: str | None = None


class StackRun(BaseModel):
    id: str
    stack_id: str
    stack_name: str
    status: RunStatus
    created_at: str
    started_at: str | None = None
    finished_at: str | None = None
    exit_code: int | None = None
    hosts: list[str] = Field(default_factory=list)
    output: str = ""
    commit_sha: str | None = None
