"""Repos API schemas."""

from __future__ import annotations

from pydantic import BaseModel, Field

from _utils.schemas import StatusMessageResponse as StatusMessageResponse


class RepoSelection(BaseModel):
    owner: str = Field(min_length=1, max_length=100)
    repo: str = Field(min_length=1, max_length=200)


RepoActivation = RepoSelection


class RepoCreate(BaseModel):
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
    roles_skipped: int = 0
    playbooks_imported: int = 0


class GithubRepo(BaseModel):
    id: int
    name: str
    full_name: str
    owner: str
    private: bool


class RepoBinding(BaseModel):
    owner: str
    repo: str
    full_name: str
    path: str


class LocalRepo(RepoBinding):
    active: bool = False


class UserInfo(BaseModel):
    id: str
    login: str
    name: str | None = None
    avatar_url: str | None = None


class SetupStatus(BaseModel):
    user: UserInfo
    repo_ready: bool
    hosts_ready: bool
    repo: RepoBinding | None = None
    onboarding_completed: bool = False
    has_racksmith_data: bool = False


class RepoListResponse(BaseModel):
    repos: list[GithubRepo]


class LocalRepoListResponse(BaseModel):
    repos: list[LocalRepo]


class RepoResponse(BaseModel):
    repo: RepoBinding


class DetectedResponse(BaseModel):
    detected: DetectedAnsiblePaths


class ImportSummaryResponse(BaseModel):
    summary: ImportAnsibleSummary
