"""Repos router: list user repos, clone to server, file tree and content."""

import re
import shutil
import subprocess
from pathlib import Path

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from ruamel.yaml import YAML
from ruamel.yaml.error import YAMLError

import settings
from auth.session import get_current_session

router = APIRouter()

_REPO_NAME_RE = re.compile(r"^[a-zA-Z0-9_-]+$")
_YAML_EXTENSIONS = {".yaml", ".yml"}


def _resolve_repo_path(owner: str, repo: str) -> Path:
    if not _REPO_NAME_RE.match(owner) or not _REPO_NAME_RE.match(repo):
        raise HTTPException(status_code=400, detail="Invalid owner or repo name")
    workspace = Path(settings.REPOS_WORKSPACE)
    target = (workspace / f"{owner}_{repo}").resolve()
    if not str(target).startswith(str(workspace.resolve())):
        raise HTTPException(status_code=400, detail="Invalid path")
    return target


def _walk_tree(path: Path) -> list[dict]:
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
                "children": _walk_tree(item),
            })
        else:
            entries.append({"name": item.name, "type": "file"})
    return entries


def _safe_relative_path(repo_root: Path, path_str: str) -> Path:
    """Resolve path within repo, reject traversal."""
    if not path_str or path_str.startswith("/") or ".." in path_str:
        raise HTTPException(status_code=400, detail="Invalid path")
    resolved = (repo_root / path_str).resolve()
    repo_resolved = repo_root.resolve()
    if not str(resolved).startswith(str(repo_resolved)):
        raise HTTPException(status_code=400, detail="Invalid path")
    return resolved


def _is_yaml_path(path_str: str) -> bool:
    return Path(path_str).suffix.lower() in _YAML_EXTENSIONS


def _validate_yaml_text(content: str) -> None:
    yaml = YAML(typ="rt")
    yaml.preserve_quotes = True
    try:
        # Iterate all documents to force full parse/validation.
        for _ in yaml.load_all(content):
            pass
    except YAMLError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid YAML: {exc}") from exc


def _get_saved_paths(repo_path: Path) -> list[str]:
    result = subprocess.run(
        ["git", "-C", str(repo_path), "status", "--porcelain"],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise HTTPException(status_code=500, detail="Failed to read git status")

    saved_paths: set[str] = set()
    for line in result.stdout.splitlines():
        if len(line) < 4:
            continue
        path_part = line[3:]
        if " -> " in path_part:
            _, new_path = path_part.split(" -> ", 1)
            candidate = new_path.strip()
        else:
            candidate = path_part.strip()
        if candidate:
            saved_paths.add(candidate)
    return sorted(saved_paths)


class CloneRequest(BaseModel):
    owner: str
    repo: str


class UpdateFileRequest(BaseModel):
    path: str
    content: str


@router.get("")
async def list_repos(session=Depends(get_current_session)):
    """List repositories the user has access to."""
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            "https://api.github.com/user/repos",
            params={"per_page": 100, "type": "all"},
            headers={"Authorization": f"Bearer {session.access_token}"},
        )

    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail="Failed to fetch repos from GitHub")

    repos = resp.json()
    return {
        "repos": [
            {
                "id": r["id"],
                "full_name": r["full_name"],
                "name": r["name"],
                "owner": r["owner"]["login"],
                "clone_url": r["clone_url"],
                "private": r.get("private", False),
            }
            for r in repos
        ]
    }


@router.post("/clone")
async def clone_repo(
    body: CloneRequest,
    session=Depends(get_current_session),
):
    """Clone a repository to the workspace."""
    owner = body.owner
    repo = body.repo

    workspace = Path(settings.REPOS_WORKSPACE)
    workspace.mkdir(parents=True, exist_ok=True)
    target_name = f"{owner}_{repo}"
    target_path = workspace / target_name

    if target_path.exists():
        shutil.rmtree(target_path)

    clone_url = f"https://x-access-token:{session.access_token}@github.com/{owner}/{repo}.git"

    result = subprocess.run(
        ["git", "clone", "--depth", "1", clone_url, str(target_path)],
        capture_output=True,
        text=True,
    )

    if result.returncode != 0:
        raise HTTPException(
            status_code=502,
            detail=f"Clone failed: {result.stderr or result.stdout}",
        )

    return {"path": str(target_path), "status": "cloned"}


@router.get("/cloned")
async def list_cloned(session=Depends(get_current_session)):
    """List repositories cloned to the workspace."""
    workspace = Path(settings.REPOS_WORKSPACE)
    if not workspace.exists():
        return {"cloned": []}
    cloned = []
    for item in workspace.iterdir():
        if item.is_dir() and not item.name.startswith("."):
            parts = item.name.split("_", 1)
            if len(parts) == 2:
                cloned.append({"owner": parts[0], "repo": parts[1]})
    return {"cloned": cloned}


@router.get("/{owner}/{repo}/tree")
async def get_tree(
    owner: str,
    repo: str,
    session=Depends(get_current_session),
):
    """Return recursive file tree for a cloned repo (excludes .git)."""
    repo_path = _resolve_repo_path(owner, repo)
    if not repo_path.exists() or not repo_path.is_dir():
        raise HTTPException(status_code=404, detail="Repo not cloned")
    entries = _walk_tree(repo_path)
    return {"entries": entries}


@router.get("/{owner}/{repo}/file")
async def get_file(
    owner: str,
    repo: str,
    path: str,
    session=Depends(get_current_session),
):
    """Return file content as text."""
    repo_path = _resolve_repo_path(owner, repo)
    if not repo_path.exists() or not repo_path.is_dir():
        raise HTTPException(status_code=404, detail="Repo not cloned")
    file_path = _safe_relative_path(repo_path, path)
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    try:
        content = file_path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="Binary file")
    return {"content": content}


@router.get("/{owner}/{repo}/file-statuses")
async def get_file_statuses(
    owner: str,
    repo: str,
    session=Depends(get_current_session),
):
    """Return server-side saved paths based on git status."""
    repo_path = _resolve_repo_path(owner, repo)
    if not repo_path.exists() or not repo_path.is_dir():
        raise HTTPException(status_code=404, detail="Repo not cloned")

    return {"saved_paths": _get_saved_paths(repo_path)}


@router.put("/{owner}/{repo}/file")
async def update_file(
    owner: str,
    repo: str,
    body: UpdateFileRequest,
    session=Depends(get_current_session),
):
    """Update file content as UTF-8 text. YAML files must be valid."""
    repo_path = _resolve_repo_path(owner, repo)
    if not repo_path.exists() or not repo_path.is_dir():
        raise HTTPException(status_code=404, detail="Repo not cloned")

    file_path = _safe_relative_path(repo_path, body.path)
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="File not found")

    if "\x00" in body.content:
        raise HTTPException(status_code=400, detail="Binary content is not supported")

    if _is_yaml_path(body.path):
        _validate_yaml_text(body.content)

    try:
        file_path.write_text(body.content, encoding="utf-8")
    except OSError as exc:
        raise HTTPException(status_code=500, detail="Failed to write file") from exc

    return {"status": "updated"}
