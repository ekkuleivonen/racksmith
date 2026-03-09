"""Per-user repo management: clone, activate, list, create, drop."""

from __future__ import annotations

import re
import shutil
from pathlib import Path

import httpx

from github.misc import (
    ActiveRepoBinding,
    clear_active_repo,
    clone_or_fetch,
    ensure_racksmith_branch,
    read_active_repo,
    resolve_active_repo_path,
    run_git,
    sync_racksmith_branch,
    user_login,
    user_repo_dir,
    user_storage_id,
    user_workspace_path,
    write_active_repo,
)
GITHUB_REMOTE_RE = re.compile(
    r"github\.com[:/](?P<owner>[^/]+)/(?P<repo>[^/]+?)(?:\.git)?$"
)


class ReposManager:
    def user_id_from_session(self, session) -> str:
        return user_storage_id(session.user)

    def current_repo(self, session) -> ActiveRepoBinding | None:
        return read_active_repo(self.user_id_from_session(session))

    def active_repo_path(self, session) -> Path:
        return resolve_active_repo_path(self.user_id_from_session(session))

    async def list_repos(self, access_token: str) -> list[dict]:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                "https://api.github.com/user/repos",
                params={"per_page": 100, "type": "all", "sort": "updated"},
                headers={"Authorization": f"Bearer {access_token}"},
            )
            if resp.status_code != 200:
                raise RuntimeError("Failed to fetch repos from GitHub")

        return [
            {
                "id": repo["id"],
                "name": repo["name"],
                "full_name": repo["full_name"],
                "owner": repo["owner"]["login"],
                "private": bool(repo.get("private", False)),
            }
            for repo in resp.json()
        ]

    async def create_repo(
        self, access_token: str, name: str, *, private: bool = True
    ) -> dict:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                "https://api.github.com/user/repos",
                headers={"Authorization": f"Bearer {access_token}"},
                json={"name": name, "private": private, "auto_init": True},
            )
        if resp.status_code not in (200, 201):
            raise RuntimeError("Failed to create repository on GitHub")
        repo = resp.json()
        return {
            "id": repo["id"],
            "name": repo["name"],
            "full_name": repo["full_name"],
            "owner": repo["owner"]["login"],
            "private": bool(repo.get("private", False)),
        }

    def activate_repo(self, session, *, owner: str, repo: str) -> dict:
        user_id = self.user_id_from_session(session)
        repo_path = clone_or_fetch(owner, repo, session.access_token, user_id=user_id)
        if not repo_path.exists():
            repo_path = user_repo_dir(user_id, owner, repo)
        ensure_racksmith_branch(repo_path)
        binding = write_active_repo(
            ActiveRepoBinding(user_id=user_id, owner=owner, repo=repo)
        )
        return self.serialize_binding(binding)

    def activate_local_repo(self, session, *, owner: str, repo: str) -> dict:
        user_id = self.user_id_from_session(session)
        repo_path = user_repo_dir(user_id, owner, repo)
        if not repo_path.is_dir():
            raise FileNotFoundError("Local repo is missing on disk")
        ensure_racksmith_branch(repo_path)
        binding = write_active_repo(
            ActiveRepoBinding(user_id=user_id, owner=owner, repo=repo)
        )
        return self.serialize_binding(binding)

    def serialize_binding(self, binding: ActiveRepoBinding) -> dict:
        repo_path = user_repo_dir(binding.user_id, binding.owner, binding.repo)
        return {
            "owner": binding.owner,
            "repo": binding.repo,
            "full_name": binding.full_name,
            "path": str(repo_path),
        }

    def _binding_from_repo_path(
        self, user_id: str, repo_path: Path
    ) -> ActiveRepoBinding | None:
        if not repo_path.is_dir() or repo_path.name.startswith("."):
            return None
        remote = run_git(repo_path, ["remote", "get-url", "origin"], check=False)
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

    def list_local_repos(self, session) -> list[dict]:
        user_id = self.user_id_from_session(session)
        active = self.current_repo(session)
        workspace = user_workspace_path(user_id)
        if not workspace.is_dir():
            return []

        repos: list[dict] = []
        for entry in sorted(workspace.iterdir(), key=lambda path: path.name.lower()):
            binding = self._binding_from_repo_path(user_id, entry)
            if not binding:
                continue
            repo = self.serialize_binding(binding)
            repo["active"] = (
                active is not None
                and active.owner == binding.owner
                and active.repo == binding.repo
            )
            repos.append(repo)
        return repos

    def drop_repo(self, session, *, owner: str, repo: str) -> None:
        user_id = self.user_id_from_session(session)
        repo_path = user_repo_dir(user_id, owner, repo)
        if not repo_path.is_dir():
            raise FileNotFoundError("Local repo is missing on disk")
        active = self.current_repo(session)
        if active and active.owner == owner and active.repo == repo:
            clear_active_repo(user_id)
        shutil.rmtree(repo_path)

    def sync_repo(self, session) -> None:
        """Rebase racksmith branch on top of the base branch (e.g. main)."""
        repo_path = self.active_repo_path(session)
        sync_racksmith_branch(repo_path)

    def status(self, session, *, hosts_ready: bool) -> dict:
        binding = self.current_repo(session)
        if binding:
            repo_path = user_repo_dir(binding.user_id, binding.owner, binding.repo)
            if not repo_path.is_dir():
                binding = None
        repo = self.serialize_binding(binding) if binding else None
        return {
            "user": {
                "id": self.user_id_from_session(session),
                "login": user_login(session.user),
                "name": session.user.get("name"),
                "avatar_url": session.user.get("avatar_url"),
            },
            "repo_ready": binding is not None,
            "hosts_ready": hosts_ready,
            "repo": repo,
        }


repos_manager = ReposManager()
