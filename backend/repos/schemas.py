"""Repos API schemas."""

from __future__ import annotations

from pydantic import BaseModel, Field


class RepoSelectionRequest(BaseModel):
    owner: str = Field(min_length=1, max_length=100)
    repo: str = Field(min_length=1, max_length=200)


RepoActivationRequest = RepoSelectionRequest  # Alias; identical schema


class RepoCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    private: bool = True


class ImportAnsibleRequest(BaseModel):
    """Paths (relative to repo root) to import into .racksmith/."""

    inventory_path: str | None = None
    roles_path: str | None = None
    playbooks_path: str | None = None
    host_vars_path: str | None = None
    group_vars_path: str | None = None


class DetectedAnsiblePaths(BaseModel):
    """Detected Ansible resource locations in the repo."""

    inventory_path: str | None = None
    roles_path: str | None = None
    playbooks_path: str | None = None
    host_vars_path: str | None = None
    group_vars_path: str | None = None


class ImportAnsibleSummary(BaseModel):
    """Summary of what was imported."""

    inventory_files: int = 0
    host_vars_files: int = 0
    group_vars_files: int = 0
    roles_imported: int = 0
    playbooks_imported: int = 0
