"""Pydantic models mirroring the registry API request/response types."""

from __future__ import annotations

from pydantic import BaseModel, Field

from _utils.schemas import PlatformSpec, RoleInputSpec


class RegistryOwner(BaseModel):
    username: str
    avatar_url: str


class RegistryVersion(BaseModel):
    id: str
    version_number: int
    racksmith_version: str
    name: str
    description: str
    platforms: list[PlatformSpec]
    tags: list[str]
    inputs: list[RoleInputSpec]
    tasks_yaml: str
    defaults_yaml: str
    meta_yaml: str
    created_at: str


class RegistryRole(BaseModel):
    id: str
    slug: str
    owner: RegistryOwner
    download_count: int
    created_at: str
    updated_at: str | None
    latest_version: RegistryVersion | None


class RegistryRoleList(BaseModel):
    items: list[RegistryRole]
    total: int
    page: int
    per_page: int


class RoleCreate(BaseModel):
    """Payload for POST /roles (new role)."""

    name: str
    racksmith_version: str
    description: str = ""
    platforms: list[PlatformSpec] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    inputs: list[RoleInputSpec] = Field(default_factory=list)
    tasks_yaml: str = ""
    defaults_yaml: str = ""
    meta_yaml: str = ""


class RoleUpdate(BaseModel):
    """Payload for PUT /roles/{slug} (new version of existing role)."""

    racksmith_version: str
    name: str | None = None
    description: str | None = None
    platforms: list[PlatformSpec] | None = None
    tags: list[str] | None = None
    inputs: list[RoleInputSpec] | None = None
    tasks_yaml: str | None = None
    defaults_yaml: str | None = None
    meta_yaml: str | None = None


class RoleImportResponse(BaseModel):
    """Response after importing a role from registry into local repo."""

    slug: str
    name: str
    message: str
