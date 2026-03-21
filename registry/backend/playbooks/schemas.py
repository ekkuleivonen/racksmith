from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class PlaybookRoleRef(BaseModel):
    """A reference to a registry role used by a playbook."""

    registry_role_id: UUID
    version_number: int | None = None
    vars: dict[str, Any] = Field(default_factory=dict)
    role_name: str | None = None


class ContributorResponse(BaseModel):
    username: str
    avatar_url: str

    model_config = {"from_attributes": True}


class OwnerResponse(BaseModel):
    username: str
    avatar_url: str

    model_config = {"from_attributes": True}


# ── Requests ──────────────────────────────────────────────────────────────────


_MAX_DESCRIPTION_LENGTH = 10_000


class PlaybookCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=_MAX_DESCRIPTION_LENGTH)
    become: bool = False
    roles: list[PlaybookRoleRef] = Field(default_factory=list, max_length=100)
    tags: list[str] = Field(default_factory=list, max_length=30)


class PlaybookUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=200)
    description: str | None = Field(default=None, max_length=_MAX_DESCRIPTION_LENGTH)
    become: bool | None = None
    roles: list[PlaybookRoleRef] | None = Field(default=None, max_length=100)
    tags: list[str] | None = Field(default=None, max_length=30)


class ConfirmDownloadRequest(BaseModel):
    download_event_id: UUID


# ── Responses ─────────────────────────────────────────────────────────────────


class PlaybookVersionResponse(BaseModel):
    id: UUID
    playbook_id: UUID
    version_number: int
    name: str
    description: str
    become: bool
    roles: list[PlaybookRoleRef]
    tags: list[str]
    contributors: list[ContributorResponse]
    created_at: datetime
    download_event_id: UUID | None = None

    model_config = {"from_attributes": True}


class PlaybookResponse(BaseModel):
    id: UUID
    owner: OwnerResponse
    download_count: int
    created_at: datetime
    updated_at: datetime | None
    latest_version: PlaybookVersionResponse | None = None

    model_config = {"from_attributes": True}


class PlaybookListResponse(BaseModel):
    items: list[PlaybookResponse]
    total: int
    page: int
    per_page: int


class FacetItem(BaseModel):
    name: str
    count: int


class PlaybookFacetsResponse(BaseModel):
    tags: list[FacetItem]
