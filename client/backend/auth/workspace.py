"""Workspace path resolution, active repo binding, and file helpers."""

from __future__ import annotations

import json
import re
from dataclasses import asdict, dataclass
from datetime import UTC
from pathlib import Path

import yaml

import settings
from _utils.exceptions import RepoNotAvailableError

REPO_NAME_RE = re.compile(r"^[a-zA-Z0-9._-]+$")
YAML_EXTENSIONS = {".yaml", ".yml"}


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


# ---------------------------------------------------------------------------
# Onboarding state
# ---------------------------------------------------------------------------

def _onboarding_path(user_id: str) -> Path:
    return user_workspace_path(user_id) / ".racksmith-onboarding.json"


def read_onboarding_status(user_id: str) -> bool:
    path = _onboarding_path(user_id)
    if not path.exists():
        return False
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return bool(data.get("completed", False))
    except (OSError, json.JSONDecodeError, TypeError):
        return False


def mark_onboarding_completed(user_id: str) -> None:
    from datetime import datetime

    path = _onboarding_path(user_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps({"completed": True, "completed_at": datetime.now(UTC).isoformat()}, indent=2) + "\n",
        encoding="utf-8",
    )


def resolve_active_repo_path(user_id: str) -> Path:
    binding = read_active_repo(user_id)
    if not binding:
        raise RepoNotAvailableError("Active repo is not configured")
    repo_path = user_repo_dir(binding.user_id, binding.owner, binding.repo)
    if not repo_path.exists() or not repo_path.is_dir():
        raise RepoNotAvailableError("Active repo is missing on disk")
    return repo_path


def safe_relative_path(repo_root: Path, path_str: str) -> Path:
    if not path_str or path_str.startswith("/") or ".." in path_str:
        raise ValueError("Invalid path")
    resolved = (repo_root / path_str).resolve()
    if not str(resolved).startswith(str(repo_root.resolve())):
        raise ValueError("Invalid path")
    return resolved


# ---------------------------------------------------------------------------
# File helpers
# ---------------------------------------------------------------------------


def walk_tree(path: Path) -> list[dict[str, object]]:
    entries: list[dict[str, object]] = []
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


def validate_yaml_text(text: str) -> None:
    """Raise ValueError if text is not valid YAML."""
    try:
        yaml.safe_load(text)
    except yaml.YAMLError as exc:
        raise ValueError(f"Invalid YAML: {exc}") from exc
