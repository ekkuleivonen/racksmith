"""Pydantic models mirroring the registry API request/response types."""

from __future__ import annotations

from pydantic import BaseModel, Field

from _utils.schemas import PlatformSpec, RoleInputSpec


class RegistryOwner(BaseModel):
    username: str
    avatar_url: str


class RegistryVersion(BaseModel):
    id: str
    role_id: str
    version_number: int
    name: str
    description: str
    platforms: list[PlatformSpec]
    tags: list[str]
    inputs: list[RoleInputSpec]
    tasks_yaml: str
    defaults_yaml: str
    meta_yaml: str
    created_at: str
    download_event_id: str | None = None


class RegistryRole(BaseModel):
    id: str
    owner: RegistryOwner
    download_count: int
    playbook_download_count: int = 0
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
    description: str = ""
    platforms: list[PlatformSpec] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    inputs: list[RoleInputSpec] = Field(default_factory=list)
    tasks_yaml: str = ""
    defaults_yaml: str = ""
    meta_yaml: str = ""


class RoleUpdate(BaseModel):
    """Payload for PUT /roles/{slug} (new version of existing role)."""

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

    id: str
    name: str
    message: str


class FacetItem(BaseModel):
    name: str
    count: int


class RegistryFacets(BaseModel):
    tags: list[FacetItem]
    platforms: list[FacetItem]


# ── Playbook types ────────────────────────────────────────────────────────────


class PlaybookContributor(BaseModel):
    username: str
    avatar_url: str


class PlaybookRoleRef(BaseModel):
    registry_role_id: str
    version_number: int | None = None
    vars: dict = Field(default_factory=dict)
    role_name: str | None = None


class RegistryPlaybookVersion(BaseModel):
    id: str
    playbook_id: str
    version_number: int
    name: str
    description: str
    become: bool
    roles: list[PlaybookRoleRef]
    tags: list[str]
    contributors: list[PlaybookContributor]
    created_at: str
    download_event_id: str | None = None


class RegistryPlaybook(BaseModel):
    id: str
    owner: RegistryOwner
    download_count: int
    created_at: str
    updated_at: str | None
    latest_version: RegistryPlaybookVersion | None


class RegistryPlaybookList(BaseModel):
    items: list[RegistryPlaybook]
    total: int
    page: int
    per_page: int


class PlaybookCreate(BaseModel):
    """Payload for POST /playbooks (new playbook)."""

    name: str
    description: str = ""
    become: bool = False
    roles: list[PlaybookRoleRef] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)


class PlaybookUpdate(BaseModel):
    """Payload for PUT /playbooks/{slug} (new version of existing playbook)."""

    name: str | None = None
    description: str | None = None
    become: bool | None = None
    roles: list[PlaybookRoleRef] | None = None
    tags: list[str] | None = None


class PlaybookImportResponse(BaseModel):
    """Response after importing a playbook from registry into local repo."""

    id: str
    name: str
    message: str


class PlaybookFacets(BaseModel):
    tags: list[FacetItem]
