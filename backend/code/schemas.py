"""Code request schemas."""

from __future__ import annotations

from pydantic import BaseModel, Field


class UpdateCodeFileRequest(BaseModel):
    path: str = Field(min_length=1, max_length=500)
    content: str = Field(max_length=2_000_000)


class CreateFolderRequest(BaseModel):
    path: str = Field(min_length=1, max_length=500)


class MoveEntryRequest(BaseModel):
    src: str = Field(min_length=1, max_length=500)
    dest: str = Field(min_length=1, max_length=500)


class CommitRequest(BaseModel):
    message: str = Field(min_length=1, max_length=500)
