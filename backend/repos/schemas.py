"""Repos API schemas."""

from __future__ import annotations

from pydantic import BaseModel, Field


class RepoSelectionRequest(BaseModel):
    owner: str = Field(min_length=1, max_length=100)
    repo: str = Field(min_length=1, max_length=200)


class RepoActivationRequest(BaseModel):
    owner: str = Field(min_length=1, max_length=100)
    repo: str = Field(min_length=1, max_length=200)


class RepoCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    private: bool = True
