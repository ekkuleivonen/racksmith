"""Git, workspace, and session utilities."""

from __future__ import annotations

import json
import re
import secrets
import subprocess
import time
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import httpx
from fastapi import Cookie, HTTPException, Request
from ruamel.yaml import YAML
from ruamel.yaml.error import YAMLError

import settings
from _utils.redis import Redis

REPO_NAME_RE = re.compile(r"^[a-zA-Z0-9._-]+$")
YAML_EXTENSIONS = {".yaml", ".yml"}
RACK_TOPIC = "racksmith-rack"
RACKSMITH_BRANCH = "racksmith"


# ---------------------------------------------------------------------------
# Session management
# ---------------------------------------------------------------------------

_SESSION_PREFIX = "racksmith:session:"


@dataclass
class SessionData:
    access_token: str
    user: dict[str, Any]
    created_at: float


@dataclass
class ActiveRepoBinding:
    user_id: str
    owner: str
    repo: str

    @property
    def full_name(self) -> str:
        return f"{self.owner}/{self.repo}"

    @property
    def local_dir_name(self) -> str:
        return f"{self.owner}_{self.repo}"


def _session_key(session_id: str) -> str:
    return f"{_SESSION_PREFIX}{session_id}"


def create_session(access_token: str, user: dict[str, Any]) -> str:
    session_id = secrets.token_urlsafe(32)
    data = SessionData(access_token=access_token, user=user, created_at=time.time())
    payload = json.dumps({
        "access_token": data.access_token,
        "user": data.user,
        "created_at": data.created_at,
    })
    Redis.setex(_session_key(session_id), settings.SESSION_MAX_AGE, payload)
    return session_id


def get_session(session_id: str | None) -> SessionData | None:
    if not session_id:
        return None
    raw = Redis.get(_session_key(session_id))
    if not raw:
        return None
    try:
        d = json.loads(raw)
        data = SessionData(
            access_token=d["access_token"],
            user=d["user"],
            created_at=float(d["created_at"]),
        )
    except (json.JSONDecodeError, KeyError, TypeError):
        return None
    if time.time() - data.created_at > settings.SESSION_MAX_AGE:
        delete_session(session_id)
        return None
    return data


def delete_session(session_id: str | None) -> None:
    if session_id:
        Redis.delete(_session_key(session_id))


def user_storage_id(user: dict[str, Any]) -> str:
    value = user.get("id")
    if value in (None, ""):
        raise ValueError("Missing GitHub user id")
    return str(value)


def user_login(user: dict[str, Any]) -> str:
    return str(user.get("login") or "").strip()


def get_current_user(
    request: Request,
    session_id: str | None = Cookie(default=None, alias=settings.SESSION_COOKIE_NAME),
) -> dict[str, Any]:
    """FastAPI dependency — returns current user or raises 401."""
    data = get_session(session_id)
    if not data:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return data.user


def get_current_session(
    request: Request,
    session_id: str | None = Cookie(default=None, alias=settings.SESSION_COOKIE_NAME),
) -> SessionData:
    """FastAPI dependency — returns full session (including token) or raises 401."""
    data = get_session(session_id)
    if not data:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return data


# ---------------------------------------------------------------------------
# Workspace / path helpers
# ---------------------------------------------------------------------------


def workspace_path() -> Path:
    return Path(settings.REPOS_WORKSPACE)


def user_workspace_path(user_id: str) -> Path:
    root = workspace_path().resolve()
    path = (root / user_id).resolve()
    if not str(path).startswith(str(root)):
        raise ValueError("Invalid user workspace")
    return path


def user_binding_path(user_id: str) -> Path:
    return user_workspace_path(user_id) / ".racksmith-user.json"


def repo_dir(owner: str, repo_name: str) -> Path:
    ws = workspace_path()
    target = (ws / f"{owner}_{repo_name}").resolve()
    if not str(target).startswith(str(ws.resolve())):
        raise ValueError("Invalid repo path")
    return target


def user_repo_dir(user_id: str, owner: str, repo_name: str) -> Path:
    if not REPO_NAME_RE.match(owner) or not REPO_NAME_RE.match(repo_name):
        raise ValueError("Invalid owner or repo name")
    ws = user_workspace_path(user_id)
    target = (ws / f"{owner}_{repo_name}").resolve()
    if not str(target).startswith(str(ws.resolve())):
        raise ValueError("Invalid repo path")
    return target


def resolve_repo_path(owner: str, repo: str) -> Path:
    if not REPO_NAME_RE.match(owner) or not REPO_NAME_RE.match(repo):
        raise ValueError("Invalid owner or repo name")
    return repo_dir(owner, repo)


def write_active_repo(binding: ActiveRepoBinding) -> ActiveRepoBinding:
    path = user_binding_path(binding.user_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(asdict(binding), indent=2) + "\n", encoding="utf-8")
    return binding


def read_active_repo(user_id: str) -> ActiveRepoBinding | None:
    path = user_binding_path(user_id)
    if not path.exists():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        binding = ActiveRepoBinding(
            user_id=str(data["user_id"]),
            owner=str(data["owner"]),
            repo=str(data["repo"]),
        )
    except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError):
        return None
    if binding.user_id != user_id:
        return None
    return binding


def clear_active_repo(user_id: str) -> None:
    path = user_binding_path(user_id)
    if path.exists():
        path.unlink()


def resolve_active_repo_path(user_id: str) -> Path:
    binding = read_active_repo(user_id)
    if not binding:
        raise FileNotFoundError("Active repo is not configured")
    repo_path = user_repo_dir(binding.user_id, binding.owner, binding.repo)
    if not repo_path.exists() or not repo_path.is_dir():
        raise FileNotFoundError("Active repo is missing on disk")
    return repo_path


def safe_relative_path(repo_root: Path, path_str: str) -> Path:
    if not path_str or path_str.startswith("/") or ".." in path_str:
        raise ValueError("Invalid path")
    resolved = (repo_root / path_str).resolve()
    if not str(resolved).startswith(str(repo_root.resolve())):
        raise ValueError("Invalid path")
    return resolved


def safe_slug(value: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9-]+", "-", value.strip().lower()).strip("-")
    return slug or "rack"


# ---------------------------------------------------------------------------
# Git helpers
# ---------------------------------------------------------------------------


def run_git(
    repo_path: Path, args: list[str], *, check: bool = True
) -> subprocess.CompletedProcess:
    result = subprocess.run(
        ["git", "-C", str(repo_path), *args],
        capture_output=True,
        text=True,
    )
    if check and result.returncode != 0:
        detail = (result.stderr or result.stdout or "git command failed").strip()
        raise RuntimeError(detail)
    return result


def get_head_sha(repo_path: Path) -> str | None:
    """Return the current Git HEAD commit SHA, or None if not a repo or detached."""
    result = run_git(repo_path, ["rev-parse", "HEAD"], check=False)
    if result.returncode != 0:
        return None
    return (result.stdout or "").strip() or None


def clone_or_fetch(
    owner: str, repo_name: str, access_token: str, *, user_id: str | None = None
) -> Path:
    if user_id:
        path = user_repo_dir(user_id, owner, repo_name)
        path.parent.mkdir(parents=True, exist_ok=True)
    else:
        ws = workspace_path()
        ws.mkdir(parents=True, exist_ok=True)
        path = repo_dir(owner, repo_name)
    remote_url = (
        f"https://x-access-token:{access_token}"
        f"@github.com/{owner}/{repo_name}.git"
    )
    if not path.exists():
        result = subprocess.run(
            ["git", "clone", remote_url, str(path)],
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            raise RuntimeError(f"Clone failed: {result.stderr or result.stdout}")
        return path
    run_git(path, ["remote", "set-url", "origin", remote_url], check=False)
    run_git(path, ["fetch", "origin"], check=False)
    return path


def detect_base_branch(repo_path: Path) -> str:
    remote_head = run_git(
        repo_path,
        ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"],
        check=False,
    )
    if remote_head.returncode == 0:
        value = remote_head.stdout.strip()
        if value.startswith("origin/"):
            return value.removeprefix("origin/")
    current = run_git(repo_path, ["branch", "--show-current"], check=False)
    if current.returncode == 0 and current.stdout.strip():
        return current.stdout.strip()
    return "main"


def get_modified_paths(repo_path: Path) -> list[str]:
    statuses = get_file_statuses(repo_path)
    return statuses["modified"]


def get_untracked_paths(repo_path: Path) -> list[str]:
    statuses = get_file_statuses(repo_path)
    return statuses["untracked"]


def get_file_statuses(repo_path: Path) -> dict[str, list[str]]:
    """Return modified and untracked paths from git status --porcelain."""
    result = subprocess.run(
        ["git", "-C", str(repo_path), "status", "--porcelain", "--untracked-files=all"],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError("Failed to read git status")
    modified: set[str] = set()
    untracked: set[str] = set()
    for line in result.stdout.splitlines():
        if len(line) < 4:
            continue
        status = line[:2]
        part = line[3:]
        if " -> " in part:
            _, new = part.split(" -> ", 1)
            candidate = new.strip()
        else:
            candidate = part.strip()
        if not candidate:
            continue
        # Normalize path (git may output ./path for root-level files)
        normalized = candidate.removeprefix("./")
        if status == "??":
            untracked.add(normalized)
        else:
            modified.add(normalized)
    return {"modified": sorted(modified), "untracked": sorted(untracked)}


def ensure_racksmith_branch(repo_path: Path) -> None:
    """Ensure we're on the racksmith branch, creating it from main if needed."""
    current = run_git(repo_path, ["branch", "--show-current"], check=False)
    if current.returncode == 0 and current.stdout.strip() == RACKSMITH_BRANCH:
        return
    run_git(repo_path, ["fetch", "origin"], check=False)
    has_local = (
        run_git(repo_path, ["rev-parse", "--verify", RACKSMITH_BRANCH], check=False)
        .returncode
        == 0
    )
    has_remote = (
        run_git(
            repo_path,
            ["rev-parse", "--verify", f"origin/{RACKSMITH_BRANCH}"],
            check=False,
        ).returncode
        == 0
    )
    if has_local:
        run_git(repo_path, ["checkout", RACKSMITH_BRANCH])
    elif has_remote:
        run_git(repo_path, ["checkout", "-b", RACKSMITH_BRANCH, f"origin/{RACKSMITH_BRANCH}"])
    else:
        base = detect_base_branch(repo_path)
        run_git(repo_path, ["checkout", "-b", RACKSMITH_BRANCH, f"origin/{base}"])


def discard_changes(repo_path: Path) -> None:
    """Discard all uncommitted changes (modified, staged, and untracked)."""
    run_git(repo_path, ["reset", "--hard", "HEAD"])
    run_git(repo_path, ["clean", "-fd"])


def sync_racksmith_branch(repo_path: Path) -> None:
    """Rebase the racksmith branch on top of the user's base branch (e.g. main)."""
    run_git(repo_path, ["fetch", "origin"])
    ensure_racksmith_branch(repo_path)
    statuses = get_file_statuses(repo_path)
    if statuses["modified"] or statuses["untracked"]:
        raise RuntimeError(
            "Cannot sync: you have uncommitted changes. Commit or discard them first."
        )
    base = detect_base_branch(repo_path)
    run_git(repo_path, ["rebase", f"origin/{base}"])


def _is_binary(path: Path) -> bool:
    try:
        data = path.read_bytes()
        return b"\x00" in data[:8192]
    except OSError:
        return True


def _format_untracked_diff(path: Path) -> str:
    """Format untracked file content as diff (all additions)."""
    try:
        text = path.read_text(encoding="utf-8")
    except (UnicodeDecodeError, OSError):
        return "(binary file)"
    lines = text.splitlines()
    if not lines:
        return f"--- /dev/null\n+++ {path.name}\n"
    header = f"--- /dev/null\n+++ {path.name}\n@@ -0,0 +1,{len(lines)} @@\n"
    return header + "\n".join("+" + line for line in lines)


def get_file_diffs(repo_path: Path) -> list[dict]:
    """Return list of {path, status, diff} for modified and untracked files."""
    statuses = get_file_statuses(repo_path)
    result: list[dict] = []
    for path in statuses["modified"]:
        full_path = repo_path / path
        if not full_path.exists():
            diff_result = run_git(repo_path, ["diff", "--no-color", "--", path], check=False)
            result.append({"path": path, "status": "deleted", "diff": diff_result.stdout or ""})
            continue
        if _is_binary(full_path):
            result.append({"path": path, "status": "modified", "diff": "(binary file)"})
            continue
        diff_result = run_git(repo_path, ["diff", "--no-color", path], check=False)
        result.append({"path": path, "status": "modified", "diff": diff_result.stdout or ""})
    for path in statuses["untracked"]:
        full_path = repo_path / path
        if not full_path.exists() or not full_path.is_file():
            continue
        if _is_binary(full_path):
            result.append({"path": path, "status": "untracked", "diff": "(binary file)"})
            continue
        result.append({"path": path, "status": "untracked", "diff": _format_untracked_diff(full_path)})
    return result


def _delete_conflicting_racksmith_branches(repo_path: Path) -> None:
    """Delete remote branches under racksmith/ that would block pushing racksmith."""
    result = run_git(repo_path, ["ls-remote", "origin"], check=False)
    if result.returncode != 0:
        return
    prefix = "refs/heads/racksmith/"
    for line in result.stdout.strip().splitlines():
        parts = line.split()
        if len(parts) < 2:
            continue
        ref = parts[1]
        if ref.startswith(prefix):
            branch = ref.removeprefix("refs/heads/")
            run_git(repo_path, ["push", "origin", "--delete", branch], check=False)


def commit_and_push(
    repo_path: Path,
    message: str,
    access_token: str,
    owner: str,
    repo: str,
) -> str | None:
    """Stage all changes, commit, push to racksmith branch, create PR, return PR URL."""
    remote_url = (
        f"https://x-access-token:{access_token}"
        f"@github.com/{owner}/{repo}.git"
    )
    run_git(repo_path, ["remote", "set-url", "origin", remote_url], check=False)
    run_git(repo_path, ["add", "-A"])
    msg = message.strip()
    if not msg:
        raise ValueError("Commit message cannot be empty")
    run_git(
        repo_path,
        [
            "-c",
            f"user.name={settings.GIT_COMMIT_USER_NAME}",
            "-c",
            f"user.email={settings.GIT_COMMIT_USER_EMAIL}",
            "commit",
            "-m",
            msg,
        ],
    )
    _delete_conflicting_racksmith_branches(repo_path)
    run_git(repo_path, ["push", "origin", RACKSMITH_BRANCH])

    base = detect_base_branch(repo_path)
    return create_racksmith_pr(owner, repo, access_token, base)


def create_racksmith_pr(
    owner: str, repo: str, access_token: str, base: str
) -> str | None:
    """Create or get racksmith->base PR. Returns html_url or None on failure."""
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    with httpx.Client() as client:
        resp = client.post(
            f"https://api.github.com/repos/{owner}/{repo}/pulls",
            headers=headers,
            json={
                "title": f"Merge racksmith into {base}",
                "head": RACKSMITH_BRANCH,
                "base": base,
            },
        )
        if resp.status_code == 201:
            return resp.json().get("html_url")
        if resp.status_code == 422:
            # PR may already exist
            list_resp = client.get(
                f"https://api.github.com/repos/{owner}/{repo}/pulls",
                headers=headers,
                params={"head": f"{owner}:{RACKSMITH_BRANCH}", "base": base, "state": "open"},
            )
            if list_resp.status_code == 200 and list_resp.json():
                return list_resp.json()[0].get("html_url")
        return None


def slugify_branch_name(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    if not slug:
        slug = "changes"
    stamp = datetime.now(UTC).strftime("%Y%m%d%H%M%S")
    return f"racksmith/{slug[:40]}-{stamp}"


# ---------------------------------------------------------------------------
# File helpers
# ---------------------------------------------------------------------------


def walk_tree(path: Path) -> list[dict]:
    entries = []
    try:
        items = sorted(path.iterdir(), key=lambda p: (p.is_file(), p.name.lower()))
    except OSError:
        return entries
    for item in items:
        if item.name == ".git":
            continue
        if item.is_dir():
            entries.append({
                "name": item.name,
                "type": "dir",
                "children": walk_tree(item),
            })
        else:
            entries.append({"name": item.name, "type": "file"})
    return entries


def is_yaml_path(path_str: str) -> bool:
    return Path(path_str).suffix.lower() in YAML_EXTENSIONS


def validate_yaml_text(content: str) -> None:
    yaml = YAML(typ="rt")
    yaml.preserve_quotes = True
    try:
        for _ in yaml.load_all(content):
            pass
    except YAMLError as exc:
        raise ValueError(f"Invalid YAML: {exc}") from exc
