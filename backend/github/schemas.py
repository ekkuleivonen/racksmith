"""GitHub API request/response schemas."""

from pydantic import BaseModel


class CloneRequest(BaseModel):
    owner: str
    repo: str


class UpdateFileRequest(BaseModel):
    path: str
    content: str


class CreatePrRequest(BaseModel):
    title: str
    message: str
