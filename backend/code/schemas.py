"""Code request schemas."""

from __future__ import annotations

from pydantic import BaseModel


class UpdateCodeFileRequest(BaseModel):
    path: str
    content: str
