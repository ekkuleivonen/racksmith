"""Code request schemas."""

from __future__ import annotations

from pydantic import BaseModel


class UpdateCodeFileRequest(BaseModel):
    path: str
    content: str


class CreateFolderRequest(BaseModel):
    path: str


class MoveEntryRequest(BaseModel):
    src: str
    dest: str


class CommitRequest(BaseModel):
    message: str
