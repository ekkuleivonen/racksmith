from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, model_validator


class RoleInputSpec(BaseModel):
    """Typed spec for role input parameters."""

    key: str = Field(min_length=1, max_length=80)
    label: str = ""
    description: str = ""
    type: Literal["string", "boolean", "secret", "str", "bool", "list", "dict"] = "string"
    placeholder: str = ""
    default: str | bool | int | list | dict | None = None
    required: bool = False
    options: list[str] = Field(default_factory=list)
    choices: list[str] = Field(default_factory=list)
    no_log: bool = False
    secret: bool = False

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
        if "racksmith_secret" in d and "secret" not in d:
            d["secret"] = d.pop("racksmith_secret", False)
        if "racksmith_interactive" in d and "secret" not in d:
            d["secret"] = d.pop("racksmith_interactive", False)
        if "interactive" in d and "secret" not in d:
            d["secret"] = d.pop("interactive", False)
        if "choices" in d and not d.get("options"):
            d.setdefault("options", d["choices"])
        for field in ("options", "choices"):
            if isinstance(d.get(field), list):
                d[field] = [
                    ("yes" if v else "no") if isinstance(v, bool) else str(v)
                    for v in d[field]
                ]
        return d


class PlatformSpec(BaseModel):
    """Typed spec for role platform compatibility."""

    name: str
    versions: list[str] = Field(default_factory=list)

    model_config = {"extra": "ignore"}


# ── Requests ──────────────────────────────────────────────────────────────────


_MAX_YAML_LENGTH = 512_000  # 512 KB per YAML field
_MAX_DESCRIPTION_LENGTH = 10_000


class RoleCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=_MAX_DESCRIPTION_LENGTH)
    platforms: list[PlatformSpec] = Field(default_factory=list, max_length=50)
    tags: list[str] = Field(default_factory=list, max_length=30)
    inputs: list[RoleInputSpec] = Field(default_factory=list, max_length=100)
    tasks_yaml: str = Field(default="", max_length=_MAX_YAML_LENGTH)
    defaults_yaml: str = Field(default="", max_length=_MAX_YAML_LENGTH)
    meta_yaml: str = Field(default="", max_length=_MAX_YAML_LENGTH)


class RoleUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=200)
    description: str | None = Field(default=None, max_length=_MAX_DESCRIPTION_LENGTH)
    platforms: list[PlatformSpec] | None = Field(default=None, max_length=50)
    tags: list[str] | None = Field(default=None, max_length=30)
    inputs: list[RoleInputSpec] | None = Field(default=None, max_length=100)
    tasks_yaml: str | None = Field(default=None, max_length=_MAX_YAML_LENGTH)
    defaults_yaml: str | None = Field(default=None, max_length=_MAX_YAML_LENGTH)
    meta_yaml: str | None = Field(default=None, max_length=_MAX_YAML_LENGTH)


class ConfirmDownloadRequest(BaseModel):
    download_event_id: UUID


# ── Responses ─────────────────────────────────────────────────────────────────


class OwnerOut(BaseModel):
    username: str
    avatar_url: str

    model_config = {"from_attributes": True}


class VersionOut(BaseModel):
    id: UUID
    role_id: UUID
    version_number: int
    name: str
    description: str
    platforms: list[PlatformSpec]
    tags: list[str]
    inputs: list[RoleInputSpec]
    tasks_yaml: str
    defaults_yaml: str
    meta_yaml: str
    created_at: datetime
    download_event_id: UUID | None = None

    model_config = {"from_attributes": True}


class RoleOut(BaseModel):
    id: UUID
    slug: str
    owner: OwnerOut
    download_count: int
    playbook_download_count: int = 0
    created_at: datetime
    updated_at: datetime | None
    latest_version: VersionOut | None = None

    model_config = {"from_attributes": True}


class RoleListOut(BaseModel):
    items: list[RoleOut]
    total: int
    page: int
    per_page: int


class FacetItem(BaseModel):
    name: str
    count: int


class FacetsOut(BaseModel):
    tags: list[FacetItem]
    platforms: list[FacetItem]
