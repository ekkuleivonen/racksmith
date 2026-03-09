from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


# ── Requests ──────────────────────────────────────────────────────────────────


class RoleCreate(BaseModel):
    name: str
    racksmith_version: str
    description: str = ""
    platforms: list[Any] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    inputs: list[Any] = Field(default_factory=list)
    tasks_yaml: str = ""
    defaults_yaml: str = ""
    meta_yaml: str = ""


class RoleUpdate(BaseModel):
    racksmith_version: str
    name: str | None = None
    description: str | None = None
    platforms: list[Any] | None = None
    tags: list[str] | None = None
    inputs: list[Any] | None = None
    tasks_yaml: str | None = None
    defaults_yaml: str | None = None
    meta_yaml: str | None = None


# ── Responses ─────────────────────────────────────────────────────────────────


class OwnerOut(BaseModel):
    username: str
    avatar_url: str

    model_config = {"from_attributes": True}


class VersionOut(BaseModel):
    id: UUID
    version_number: int
    racksmith_version: str
    name: str
    description: str
    platforms: list[Any]
    tags: list[str]
    inputs: list[Any]
    tasks_yaml: str
    defaults_yaml: str
    meta_yaml: str
    created_at: datetime

    model_config = {"from_attributes": True}


class RoleOut(BaseModel):
    id: UUID
    slug: str
    owner: OwnerOut
    download_count: int
    created_at: datetime
    updated_at: datetime | None
    latest_version: VersionOut | None = None

    model_config = {"from_attributes": True}


class RoleListOut(BaseModel):
    items: list[RoleOut]
    total: int
    page: int
    per_page: int
