"""Files request/response schemas."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field

from _utils.schemas import StatusMessageResponse as StatusMessageResponse


class FileUpdate(BaseModel):
    path: str = Field(min_length=1, max_length=500)
    content: str = Field(max_length=2_000_000)


class CreateFolderRequest(BaseModel):
    path: str = Field(min_length=1, max_length=500)


class MoveEntryRequest(BaseModel):
    src: str = Field(min_length=1, max_length=500)
    dest: str = Field(min_length=1, max_length=500)


class CommitRequest(BaseModel):
    message: str = Field(min_length=1, max_length=500)


class TreeResponse(BaseModel):
    entries: list[dict[str, Any]]


class FileContentResponse(BaseModel):
    content: str


class DiffsResponse(BaseModel):
    files: list[dict[str, Any]]


class FileStatusesResponse(BaseModel):
    modified_paths: list[str]
    untracked_paths: list[str]


class CommitResponse(BaseModel):
    status: str
    pr_url: str | None = None
