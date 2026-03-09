"""Playbook request/response schemas."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


RunStatus = Literal["queued", "running", "completed", "failed"]


class RoleCatalogEntry(BaseModel):
    slug: str
    name: str
    description: str
    inputs: list[dict[str, Any]] = Field(default_factory=list)
    labels: list[str] = Field(default_factory=list)


class PlaybookRoleEntry(BaseModel):
    role_slug: str = Field(min_length=1, max_length=120)
    vars: dict[str, Any] = Field(default_factory=dict)


class PlaybookUpsertRequest(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    description: str = Field(default="", max_length=500)
    roles: list[PlaybookRoleEntry] = Field(default_factory=list)


class PlaybookSummary(BaseModel):
    id: str
    path: str
    name: str
    description: str = ""
    roles: list[str] = Field(default_factory=list)
    updated_at: str


class PlaybookDetail(PlaybookSummary):
    roles_catalog: list[RoleCatalogEntry] = Field(default_factory=list)
    role_entries: list[PlaybookRoleEntry] = Field(default_factory=list)
    raw_content: str


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
    become: bool = False
    become_password: str | None = None


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
