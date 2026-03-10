from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, model_validator


# Shared types (backend uses _utils.schemas; registry defines locally for independence)
class _RoleInputSpec(BaseModel):
    """Typed spec for role input parameters — mirrors backend's RoleInputSpec."""

    key: str = Field(min_length=1, max_length=80)
    label: str = ""
    description: str = ""
    type: Literal["string", "boolean", "select", "secret", "str", "bool"] = "string"
    placeholder: str = ""
    default: str | bool | int | None = None
    required: bool = False
    options: list[str] = Field(default_factory=list)
    choices: list[str] = Field(default_factory=list)
    no_log: bool = False

    model_config = {"extra": "ignore"}

    @model_validator(mode="before")
    @classmethod
    def coerce_racksmith_keys(cls, data: object) -> object:
        if not isinstance(data, dict):
            return data
        d = dict(data)
        if "racksmith_label" in d and "label" not in d:
            d["label"] = d.pop("racksmith_label", "")
        if "racksmith_placeholder" in d and "placeholder" not in d:
            d["placeholder"] = d.pop("racksmith_placeholder", "")
        if "choices" in d and not d.get("options"):
            d.setdefault("options", d["choices"])
        return d


class _PlatformSpec(BaseModel):
    """Typed spec for role platform compatibility — mirrors backend's PlatformSpec."""

    name: str
    versions: list[str] = Field(default_factory=list)

    model_config = {"extra": "ignore"}


# ── Requests ──────────────────────────────────────────────────────────────────


class RoleCreate(BaseModel):
    name: str
    racksmith_version: str
    description: str = ""
    platforms: list[_PlatformSpec] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    inputs: list[_RoleInputSpec] = Field(default_factory=list)
    tasks_yaml: str = ""
    defaults_yaml: str = ""
    meta_yaml: str = ""


class RoleUpdate(BaseModel):
    racksmith_version: str
    name: str | None = None
    description: str | None = None
    platforms: list[_PlatformSpec] | None = None
    tags: list[str] | None = None
    inputs: list[_RoleInputSpec] | None = None
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
    platforms: list[_PlatformSpec]
    tags: list[str]
    inputs: list[_RoleInputSpec]
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
