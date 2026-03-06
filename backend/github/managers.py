"""GitHub business logic: auth/session + repo operations + rack sync."""

from __future__ import annotations

import secrets
import shutil
import subprocess
from pathlib import Path
from typing import Any
from urllib.parse import urlencode

import httpx
from fastapi import Cookie, HTTPException, Request

import settings
from github.misc import (
    RACK_FILE,
    RACK_TOPIC,
    SessionData,
    clone_or_fetch,
    create_session,
    delete_session,
    detect_base_branch,
    get_modified_paths,
    get_session,
    is_yaml_path,
    resolve_repo_path,
    run_git,
    safe_relative_path,
    safe_slug,
    slugify_branch_name,
    validate_yaml_text,
    walk_tree,
    workspace_path,
)


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------


class AuthManager:
    """OAuth flow, session lifecycle, and FastAPI auth dependencies."""

    def __init__(self) -> None:
        self._oauth_states: dict[str, bool] = {}

    def get_login_url(self, redirect_uri: str) -> str:
        state = secrets.token_urlsafe(32)
        self._oauth_states[state] = True
        params = {
            "client_id": settings.GITHUB_CLIENT_ID,
            "redirect_uri": redirect_uri,
            "scope": settings.GITHUB_OAUTH_SCOPES,
            "state": state,
        }
        return f"https://github.com/login/oauth/authorize?{urlencode(params)}"

    async def handle_callback(
        self, code: str | None, state: str | None, redirect_uri: str
    ) -> str | None:
        """Exchange OAuth code for token, fetch user, create session.

        Returns session_id on success, None on any failure.
        """
        if not code or not state or state not in self._oauth_states:
            return None
        del self._oauth_states[state]

        async with httpx.AsyncClient() as client:
            token_resp = await client.post(
                "https://github.com/login/oauth/access_token",
                params={
                    "client_id": settings.GITHUB_CLIENT_ID,
                    "client_secret": settings.GITHUB_CLIENT_SECRET,
                    "code": code,
                    "redirect_uri": redirect_uri,
                },
                headers={"Accept": "application/json"},
            )

        access_token = token_resp.json().get("access_token")
        if not access_token:
            return None

        async with httpx.AsyncClient() as client:
            user_resp = await client.get(
                "https://api.github.com/user",
                headers={"Authorization": f"Bearer {access_token}"},
            )

        if user_resp.status_code != 200:
            return None

        return create_session(access_token, user_resp.json())

    def logout(self, session_id: str | None) -> None:
        delete_session(session_id)

    # -- FastAPI dependencies -------------------------------------------------

    def get_current_user(
        self,
        request: Request,
        session_id: str | None = Cookie(
            default=None, alias=settings.SESSION_COOKIE_NAME
        ),
    ) -> dict[str, Any]:
        data = get_session(session_id)
        if not data:
            raise HTTPException(status_code=401, detail="Not authenticated")
        return data.user

    def get_current_session(
        self,
        request: Request,
        session_id: str | None = Cookie(
            default=None, alias=settings.SESSION_COOKIE_NAME
        ),
    ) -> SessionData:
        data = get_session(session_id)
        if not data:
            raise HTTPException(status_code=401, detail="Not authenticated")
        return data


# ---------------------------------------------------------------------------
# Repos
# ---------------------------------------------------------------------------


class RepoManager:
    """Repo operations, file management, PR creation, and rack sync."""

    # -- repo operations ------------------------------------------------------

    async def list_repos(self, access_token: str) -> list[dict]:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                "https://api.github.com/user/repos",
                params={"per_page": 100, "type": "all"},
                headers={"Authorization": f"Bearer {access_token}"},
            )
        if resp.status_code != 200:
            raise RuntimeError("Failed to fetch repos from GitHub")
        return [
            {
                "id": r["id"],
                "full_name": r["full_name"],
                "name": r["name"],
                "owner": r["owner"]["login"],
                "clone_url": r["clone_url"],
                "private": r.get("private", False),
            }
            for r in resp.json()
        ]

    def clone_repo(self, owner: str, repo: str, access_token: str) -> dict:
        ws = workspace_path()
        ws.mkdir(parents=True, exist_ok=True)
        target = ws / f"{owner}_{repo}"
        if target.exists():
            shutil.rmtree(target)
        url = (
            f"https://x-access-token:{access_token}"
            f"@github.com/{owner}/{repo}.git"
        )
        result = subprocess.run(
            ["git", "clone", "--depth", "1", url, str(target)],
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            raise RuntimeError(f"Clone failed: {result.stderr or result.stdout}")
        return {"path": str(target), "status": "cloned"}

    def list_cloned(self) -> list[dict]:
        ws = workspace_path()
        if not ws.exists():
            return []
        cloned = []
        for item in ws.iterdir():
            if item.is_dir() and not item.name.startswith("."):
                parts = item.name.split("_", 1)
                if len(parts) == 2:
                    cloned.append({"owner": parts[0], "repo": parts[1]})
        return cloned

    # -- file operations ------------------------------------------------------

    def get_tree(self, owner: str, repo: str) -> list[dict]:
        repo_path = resolve_repo_path(owner, repo)
        if not repo_path.exists() or not repo_path.is_dir():
            raise FileNotFoundError("Repo not cloned")
        return walk_tree(repo_path)

    def get_file(self, owner: str, repo: str, path: str) -> str:
        repo_path = resolve_repo_path(owner, repo)
        if not repo_path.exists() or not repo_path.is_dir():
            raise FileNotFoundError("Repo not cloned")
        file_path = safe_relative_path(repo_path, path)
        if not file_path.exists() or not file_path.is_file():
            raise FileNotFoundError("File not found")
        try:
            return file_path.read_text(encoding="utf-8")
        except UnicodeDecodeError as exc:
            raise ValueError("Binary file") from exc

    def update_file(
        self, owner: str, repo: str, path: str, content: str
    ) -> None:
        repo_path = resolve_repo_path(owner, repo)
        if not repo_path.exists() or not repo_path.is_dir():
            raise FileNotFoundError("Repo not cloned")
        file_path = safe_relative_path(repo_path, path)
        if not file_path.exists() or not file_path.is_file():
            raise FileNotFoundError("File not found")
        if "\x00" in content:
            raise ValueError("Binary content is not supported")
        if is_yaml_path(path):
            validate_yaml_text(content)
        try:
            file_path.write_text(content, encoding="utf-8")
        except OSError as exc:
            raise RuntimeError("Failed to write file") from exc

    def get_file_statuses(self, owner: str, repo: str) -> list[str]:
        repo_path = resolve_repo_path(owner, repo)
        if not repo_path.exists() or not repo_path.is_dir():
            raise FileNotFoundError("Repo not cloned")
        return get_modified_paths(repo_path)

    # -- pull requests --------------------------------------------------------

    async def create_pull_request(
        self,
        owner: str,
        repo: str,
        title: str,
        message: str,
        access_token: str,
    ) -> dict:
        title = title.strip()
        message = message.strip()
        if not title:
            raise ValueError("PR title is required")

        repo_path = resolve_repo_path(owner, repo)
        if not repo_path.exists() or not repo_path.is_dir():
            raise FileNotFoundError("Repo not cloned")

        modified = get_modified_paths(repo_path)
        if not modified:
            raise ValueError("No modified files to include in PR")

        base_branch = detect_base_branch(repo_path)
        branch_name = slugify_branch_name(title)
        remote_url = (
            f"https://x-access-token:{access_token}"
            f"@github.com/{owner}/{repo}.git"
        )

        run_git(repo_path, ["remote", "set-url", "origin", remote_url])
        run_git(repo_path, ["checkout", "-b", branch_name])
        run_git(repo_path, ["add", "-A"])
        run_git(
            repo_path,
            [
                "-c", "user.name=Racksmith",
                "-c", "user.email=racksmith@local",
                "commit", "-m", title,
            ],
        )
        run_git(repo_path, ["push", "-u", "origin", branch_name])

        async with httpx.AsyncClient() as client:
            pr_resp = await client.post(
                f"https://api.github.com/repos/{owner}/{repo}/pulls",
                headers={"Authorization": f"Bearer {access_token}"},
                json={
                    "title": title,
                    "head": branch_name,
                    "base": base_branch,
                    "body": message,
                },
            )
        if pr_resp.status_code not in (200, 201):
            msg = pr_resp.json().get("message", "Failed to create pull request")
            raise RuntimeError(msg)

        pr = pr_resp.json()
        return {
            "url": pr.get("html_url"),
            "number": pr.get("number"),
            "branch": branch_name,
            "base": base_branch,
        }

    # -- rack sync ------------------------------------------------------------

    async def sync_rack(
        self,
        *,
        rack_state_json: str,
        rack_name: str,
        github_repo: str | None,
        owner: str,
        access_token: str,
    ) -> dict:
        """Push rack state to GitHub. Returns action taken + repo info."""
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Accept": "application/vnd.github+json",
        }
        async with httpx.AsyncClient() as client:
            if not github_repo:
                return await self._sync_create(
                    rack_state_json, rack_name, owner,
                    access_token, headers, client,
                )
            return await self._sync_update(
                rack_state_json, github_repo, access_token, headers, client,
            )

    async def _sync_create(
        self,
        rack_state_json: str,
        rack_name: str,
        owner: str,
        access_token: str,
        headers: dict,
        client: httpx.AsyncClient,
    ) -> dict:
        repo_name = f"racksmith-{safe_slug(rack_name)}"

        resp = await client.post(
            "https://api.github.com/user/repos",
            headers=headers,
            json={
                "name": repo_name,
                "private": True,
                "auto_init": True,
                "description": f"Racksmith rack: {rack_name}",
            },
        )
        if resp.status_code not in (200, 201):
            msg = resp.json().get("message", "Failed to create repository")
            raise RuntimeError(msg)

        full_name = resp.json()["full_name"]

        await client.put(
            f"https://api.github.com/repos/{full_name}/topics",
            headers=headers,
            json={"names": [RACK_TOPIC]},
        )

        repo_path = clone_or_fetch(owner, repo_name, access_token)
        self._write_rack_file(repo_path, rack_state_json)

        run_git(repo_path, ["add", RACK_FILE])
        run_git(
            repo_path,
            [
                "-c", "user.name=Racksmith",
                "-c", "user.email=racksmith@local",
                "commit", "-m", "Initialize rack",
            ],
        )
        run_git(repo_path, ["push", "origin", "HEAD"])

        return {"action": "created", "github_repo": full_name}

    async def _sync_update(
        self,
        rack_state_json: str,
        github_repo: str,
        access_token: str,
        headers: dict,
        client: httpx.AsyncClient,
    ) -> dict:
        repo_owner, repo_name = github_repo.split("/", 1)
        repo_path = clone_or_fetch(repo_owner, repo_name, access_token)
        base_branch = detect_base_branch(repo_path)

        remote_refs = run_git(
            repo_path,
            ["ls-remote", "--heads", "origin", "racksmith"],
            check=False,
        )

        if remote_refs.stdout.strip():
            run_git(repo_path, ["checkout", "racksmith"], check=False)
            run_git(
                repo_path,
                ["reset", "--hard", "origin/racksmith"],
                check=False,
            )
        else:
            run_git(repo_path, ["checkout", base_branch], check=False)
            run_git(
                repo_path,
                ["pull", "--ff-only", "origin", base_branch],
                check=False,
            )
            run_git(repo_path, ["checkout", "-b", "racksmith"], check=False)

        self._write_rack_file(repo_path, rack_state_json)
        run_git(repo_path, ["add", RACK_FILE])

        diff = run_git(
            repo_path, ["diff", "--cached", "--name-only"], check=False
        )

        if diff.stdout.strip():
            run_git(
                repo_path,
                [
                    "-c", "user.name=Racksmith",
                    "-c", "user.email=racksmith@local",
                    "commit", "-m", "Update rack",
                ],
            )
            run_git(repo_path, ["push", "-u", "origin", "racksmith"])
            return {
                "action": "pushed",
                "github_repo": github_repo,
                "branch": "racksmith",
            }

        run_git(repo_path, ["fetch", "origin", base_branch], check=False)
        rebase = run_git(
            repo_path, ["rebase", f"origin/{base_branch}"], check=False
        )
        if rebase.returncode != 0:
            run_git(repo_path, ["rebase", "--abort"], check=False)
            return {
                "action": "up_to_date",
                "github_repo": github_repo,
                "branch": "racksmith",
            }

        run_git(
            repo_path,
            ["push", "--force-with-lease", "origin", "racksmith"],
            check=False,
        )
        return {
            "action": "rebased",
            "github_repo": github_repo,
            "branch": "racksmith",
        }

    def _write_rack_file(self, repo_path: Path, content: str) -> None:
        rack_file = repo_path / ".racksmith" / "rack.json"
        rack_file.parent.mkdir(parents=True, exist_ok=True)
        rack_file.write_text(content, encoding="utf-8")


auth_manager = AuthManager()
repo_manager = RepoManager()
