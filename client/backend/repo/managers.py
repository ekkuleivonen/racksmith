"""Per-user repo management: clone, activate, list, create, drop."""

from __future__ import annotations

import asyncio
import re
import shutil
from pathlib import Path

import httpx

import settings
from _utils.logging import get_logger
from auth.git import (
    arun_git,
    clone_or_fetch,
    ensure_racksmith_branch,
    sync_racksmith_branch,
)
from auth.session import SessionData, user_login, user_storage_id
from auth.workspace import (
    ActiveRepoBinding,
    clear_active_repo,
    read_active_repo,
    read_onboarding_status,
    resolve_active_repo_path,
    user_repo_dir,
    user_workspace_path,
    write_active_repo,
)
from core.config import invalidate_layout_cache, resolve_layout
from core.migrations import migrate_repo
from core.racksmith_meta import read_meta
from repo.schemas import GithubRepo, LocalRepo, RepoBinding, SetupStatus, UserInfo

logger = get_logger(__name__)

GITHUB_REMOTE_RE = re.compile(
    r"github\.com[:/](?P<owner>[^/]+)/(?P<repo>[^/]+?)(?:\.git)?$"
)


class ReposManager:
    def user_id_from_session(self, session: SessionData) -> str:
        return user_storage_id(session.user)

    def current_repo(self, session: SessionData) -> ActiveRepoBinding | None:
        return read_active_repo(self.user_id_from_session(session))

    def active_repo_path(self, session: SessionData) -> Path:
        return resolve_active_repo_path(self.user_id_from_session(session))

    async def list_repos(self, access_token: str) -> list[GithubRepo]:
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    f"{settings.GITHUB_API_BASE}/user/repos",
                    params={"per_page": 100, "type": "all", "sort": "updated"},
                    headers={"Authorization": f"Bearer {access_token}"},
                )
        except httpx.RequestError as exc:
            logger.warning("github_repos_fetch_network_error", error=str(exc), exc_info=True)
            raise RuntimeError("Network error while fetching repos from GitHub") from exc

        if resp.status_code != 200:
            logger.warning("github_repos_fetch_failed", status_code=resp.status_code)
            raise RuntimeError("Failed to fetch repos from GitHub")

        return [
            GithubRepo(
                id=repo["id"],
                name=repo["name"],
                full_name=repo["full_name"],
                owner=repo["owner"]["login"],
                private=bool(repo.get("private", False)),
            )
            for repo in resp.json()
        ]

    async def create_repo(
        self, access_token: str, name: str, *, private: bool = True
    ) -> GithubRepo:
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.post(
                    f"{settings.GITHUB_API_BASE}/user/repos",
                    headers={"Authorization": f"Bearer {access_token}"},
                    json={"name": name, "private": private, "auto_init": True},
                )
        except httpx.RequestError as exc:
            logger.warning("github_repo_create_network_error", error=str(exc), exc_info=True)
            raise RuntimeError("Network error while creating repository on GitHub") from exc

        if resp.status_code not in (200, 201):
            logger.warning("github_repo_create_failed", status_code=resp.status_code)
            raise RuntimeError("Failed to create repository on GitHub")
        repo = resp.json()
        return GithubRepo(
            id=repo["id"],
            name=repo["name"],
            full_name=repo["full_name"],
            owner=repo["owner"]["login"],
            private=bool(repo.get("private", False)),
        )

    async def activate_repo(self, session: SessionData, *, owner: str, repo: str) -> RepoBinding:
        user_id = self.user_id_from_session(session)

        def _activate() -> RepoBinding:
            repo_path = clone_or_fetch(owner, repo, session.access_token, user_id=user_id)
            actual_path = repo_path if repo_path.exists() else user_repo_dir(user_id, owner, repo)
            ensure_racksmith_branch(actual_path)
            migrate_repo(actual_path, racksmith_version=settings.RACKSMITH_VERSION)
            invalidate_layout_cache(actual_path)
            binding = write_active_repo(
                ActiveRepoBinding(user_id=user_id, owner=owner, repo=repo)
            )
            logger.info("repo_activated", owner=owner, repo=repo, user_id=user_id)
            return self.serialize_binding(binding)

        return await asyncio.to_thread(_activate)

    async def activate_local_repo(self, session: SessionData, *, owner: str, repo: str) -> RepoBinding:
        user_id = self.user_id_from_session(session)
        repo_path = user_repo_dir(user_id, owner, repo)
        if not repo_path.is_dir():
            raise FileNotFoundError("Local repo is missing on disk")

        def _activate() -> None:
            ensure_racksmith_branch(repo_path)
            migrate_repo(repo_path, racksmith_version=settings.RACKSMITH_VERSION)

        await asyncio.to_thread(_activate)
        binding = write_active_repo(
            ActiveRepoBinding(user_id=user_id, owner=owner, repo=repo)
        )
        logger.info("local_repo_activated", owner=owner, repo=repo, user_id=user_id)
        return self.serialize_binding(binding)

    def serialize_binding(self, binding: ActiveRepoBinding) -> RepoBinding:
        repo_path = user_repo_dir(binding.user_id, binding.owner, binding.repo)
        return RepoBinding(
            owner=binding.owner,
            repo=binding.repo,
            full_name=binding.full_name,
            path=str(repo_path),
        )

    async def _binding_from_repo_path(
        self, user_id: str, repo_path: Path
    ) -> ActiveRepoBinding | None:
        if not repo_path.is_dir() or repo_path.name.startswith("."):
            return None
        remote = await arun_git(repo_path, ["remote", "get-url", "origin"], check=False)
        if remote.returncode != 0:
            return None
        match = GITHUB_REMOTE_RE.search(remote.stdout.strip())
        if not match:
            return None
        return ActiveRepoBinding(
            user_id=user_id,
            owner=match.group("owner"),
            repo=match.group("repo"),
        )

    async def list_local_repos(self, session: SessionData) -> list[LocalRepo]:
        user_id = self.user_id_from_session(session)
        active = self.current_repo(session)
        workspace = user_workspace_path(user_id)
        if not workspace.is_dir():
            return []

        repos: list[LocalRepo] = []
        for entry in sorted(workspace.iterdir(), key=lambda path: path.name.lower()):
            binding = await self._binding_from_repo_path(user_id, entry)
            if not binding:
                continue
            repo_binding = self.serialize_binding(binding)
            is_active = (
                active is not None
                and active.owner == binding.owner
                and active.repo == binding.repo
            )
            repos.append(
                LocalRepo(
                    owner=repo_binding.owner,
                    repo=repo_binding.repo,
                    full_name=repo_binding.full_name,
                    path=repo_binding.path,
                    active=is_active,
                )
            )
        return repos

    def drop_repo(self, session: SessionData, *, owner: str, repo: str) -> None:
        user_id = self.user_id_from_session(session)
        repo_path = user_repo_dir(user_id, owner, repo)
        if not repo_path.is_dir():
            raise FileNotFoundError("Local repo is missing on disk")
        active = self.current_repo(session)
        if active and active.owner == owner and active.repo == repo:
            clear_active_repo(user_id)
        shutil.rmtree(repo_path)
        logger.info("repo_dropped", owner=owner, repo=repo, user_id=user_id)

    async def sync_repo(self, session: SessionData) -> None:
        """Rebase racksmith branch on top of the base branch (e.g. main)."""
        try:
            repo_path = self.active_repo_path(session)

            def _sync() -> None:
                sync_racksmith_branch(repo_path)
                migrate_repo(repo_path, racksmith_version=settings.RACKSMITH_VERSION)
                invalidate_layout_cache(repo_path)

            await asyncio.to_thread(_sync)
            binding = self.current_repo(session)
            if binding:
                logger.info("repo_synced", owner=binding.owner, repo=binding.repo, user_id=binding.user_id)
        except RuntimeError as exc:
            logger.warning("repo_sync_failed", error=str(exc), exc_info=True)
            raise

    @staticmethod
    def _has_racksmith_data(repo_path: Path) -> bool:
        """True if the repo already contains meaningful .racksmith content."""
        layout = resolve_layout(repo_path)
        if not layout.racksmith_base.exists():
            return False
        meta = read_meta(layout)
        if meta.hosts or meta.roles or meta.playbooks or meta.racks:
            return True
        if layout.host_vars_path.is_dir() and any(layout.host_vars_path.iterdir()):
            return True
        return False

    def status(self, session: SessionData, *, hosts_ready: bool) -> SetupStatus:
        user_id = self.user_id_from_session(session)
        binding = self.current_repo(session)
        has_data = False
        if binding:
            repo_path = user_repo_dir(binding.user_id, binding.owner, binding.repo)
            if not repo_path.is_dir():
                binding = None
            else:
                has_data = self._has_racksmith_data(repo_path)
        repo = self.serialize_binding(binding) if binding else None
        return SetupStatus(
            user=UserInfo(
                id=user_id,
                login=user_login(session.user),
                name=session.user.get("name"),
                avatar_url=session.user.get("avatar_url"),
            ),
            repo_ready=binding is not None,
            hosts_ready=hosts_ready,
            repo=repo,
            onboarding_completed=read_onboarding_status(user_id),
            has_racksmith_data=has_data,
        )


repos_manager = ReposManager()
