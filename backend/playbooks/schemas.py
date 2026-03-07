"""Playbook request/response schemas."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


RunStatus = Literal["queued", "running", "completed", "failed"]


class RoleTemplateField(BaseModel):
    key: str
    label: str
    placeholder: str = ""
    default: Any | None = None


class RoleTemplate(BaseModel):
    id: str
    name: str
    description: str
    fields: list[RoleTemplateField] = Field(default_factory=list)


class PlaybookRoleInput(BaseModel):
    template_id: str = Field(min_length=1, max_length=120)
    vars: dict[str, Any] = Field(default_factory=dict)


class PlaybookUpsertRequest(BaseModel):
    file_name: str = Field(default="", max_length=120)
    play_name: str = Field(min_length=1, max_length=160)
    description: str = Field(default="", max_length=500)
    become: bool = False
    roles: list[PlaybookRoleInput] = Field(default_factory=list)


class PlaybookSummary(BaseModel):
    id: str
    file_name: str
    path: str
    play_name: str
    description: str = ""
    become: bool = False
    roles: list[str] = Field(default_factory=list)
    updated_at: str


class PlaybookDetail(PlaybookSummary):
    role_templates: list[RoleTemplate] = Field(default_factory=list)
    role_entries: list[PlaybookRoleInput] = Field(default_factory=list)
    raw_content: str


class PlaybookTargetItem(BaseModel):
    rack_id: str = Field(min_length=1, max_length=120)
    item_id: str = Field(min_length=1, max_length=120)


class PlaybookTargetSelection(BaseModel):
    rack_ids: list[str] = Field(default_factory=list)
    labels: list[str] = Field(default_factory=list)
    items: list[PlaybookTargetItem] = Field(default_factory=list)


class PlaybookResolveTargetsRequest(BaseModel):
    targets: PlaybookTargetSelection


class PlaybookResolveTargetsResponse(BaseModel):
    hosts: list[str] = Field(default_factory=list)


class PlaybookRunRequest(BaseModel):
    targets: PlaybookTargetSelection


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
