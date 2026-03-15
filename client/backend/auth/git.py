"""Git operations: clone, fetch, commit, push, branch management, diffs."""

from __future__ import annotations

import asyncio
import re
import subprocess
from datetime import UTC, datetime
from pathlib import Path

import httpx

import settings
from _utils.logging import get_logger
from auth.workspace import repo_dir, user_repo_dir, workspace_path

logger = get_logger(__name__)

_SENSITIVE_PATTERNS = re.compile(
    r"(https?://)[^\s@]+@",
    re.IGNORECASE,
)


def _sanitize_error(msg: str) -> str:
    """Strip credentials and paths from error messages before logging."""
    return _SENSITIVE_PATTERNS.sub(r"\1***@", msg)


def _ensure_git_identity(repo_path: Path) -> None:
    """Set local git user.name/email if not already configured."""
    name_result = subprocess.run(
        ["git", "-C", str(repo_path), "config", "user.name"],
        capture_output=True, text=True,
    )
    if name_result.returncode != 0 or not name_result.stdout.strip():
        subprocess.run(
            ["git", "-C", str(repo_path), "config", "user.name", settings.GIT_COMMIT_USER_NAME],
            capture_output=True, text=True,
        )
        subprocess.run(
            ["git", "-C", str(repo_path), "config", "user.email", settings.GIT_COMMIT_USER_EMAIL],
            capture_output=True, text=True,
        )


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


async def arun_git(
    repo_path: Path, args: list[str], *, check: bool = True
) -> subprocess.CompletedProcess[str]:
    """Async wrapper around run_git using run_in_executor."""
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(
        None, lambda: run_git(repo_path, args, check=check)
    )


async def aensure_git_identity(repo_path: Path) -> None:
    """Async wrapper around _ensure_git_identity."""
    loop = asyncio.get_running_loop()
    await loop.run_in_executor(None, lambda: _ensure_git_identity(repo_path))


async def aget_head_sha(repo_path: Path) -> str | None:
    """Async wrapper around get_head_sha."""
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, lambda: get_head_sha(repo_path))


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
        _ensure_git_identity(path)
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


def get_racksmith_status_paths_repo_relative(
    repo_path: Path, racksmith_prefix: str
) -> list[str]:
    """Return repo-relative paths of modified/untracked files under racksmith_prefix."""
    statuses = get_file_statuses(repo_path)
    repo_rel: list[str] = []
    for p in set(statuses["modified"]) | set(statuses["untracked"]):
        normalized = p.removeprefix("./")
        if normalized == racksmith_prefix or normalized.startswith(
            racksmith_prefix + "/"
        ):
            repo_rel.append(normalized)
    return sorted(repo_rel)


def get_file_statuses(
    repo_path: Path,
    *,
    racksmith_prefix: str | None = None,
) -> dict[str, list[str]]:
    """Return modified and untracked paths from git status --porcelain.

    When racksmith_prefix is provided, only include paths under that prefix
    (equal or start with prefix/). Returned paths are stripped of the prefix
    so they are racksmith-relative (e.g. playbooks/deploy.yml).
    """
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
        normalized = candidate.removeprefix("./")
        if racksmith_prefix:
            if normalized != racksmith_prefix and not normalized.startswith(
                racksmith_prefix + "/"
            ):
                continue
            if normalized == racksmith_prefix:
                stripped = ""
            else:
                stripped = normalized[len(racksmith_prefix) + 1 :]
            if not stripped:
                continue
            normalized = stripped
        if status == "??":
            untracked.add(normalized)
        else:
            modified.add(normalized)
    return {"modified": sorted(modified), "untracked": sorted(untracked)}


def ensure_racksmith_branch(repo_path: Path) -> None:
    """Ensure we're on the racksmith branch, creating it from main if needed."""
    current = run_git(repo_path, ["branch", "--show-current"], check=False)
    if current.returncode == 0 and current.stdout.strip() == settings.GIT_RACKSMITH_BRANCH:
        return
    run_git(repo_path, ["fetch", "origin"], check=False)
    has_local = (
        run_git(repo_path, ["rev-parse", "--verify", settings.GIT_RACKSMITH_BRANCH], check=False)
        .returncode
        == 0
    )
    has_remote = (
        run_git(
            repo_path,
            ["rev-parse", "--verify", f"origin/{settings.GIT_RACKSMITH_BRANCH}"],
            check=False,
        ).returncode
        == 0
    )
    if has_local:
        run_git(repo_path, ["checkout", settings.GIT_RACKSMITH_BRANCH])
    elif has_remote:
        run_git(repo_path, ["checkout", "-b", settings.GIT_RACKSMITH_BRANCH, f"origin/{settings.GIT_RACKSMITH_BRANCH}"])
    else:
        base = detect_base_branch(repo_path)
        run_git(repo_path, ["checkout", "-b", settings.GIT_RACKSMITH_BRANCH, f"origin/{base}"])


def discard_changes(repo_path: Path) -> None:
    """Discard all uncommitted changes (modified, staged, and untracked)."""
    run_git(repo_path, ["reset", "--hard", "HEAD"])
    run_git(repo_path, ["clean", "-fd"])


def sync_racksmith_branch(repo_path: Path) -> None:
    """Rebase the racksmith branch on top of the user's base branch (e.g. main)."""
    _ensure_git_identity(repo_path)
    run_git(repo_path, ["fetch", "origin"])
    _abort_stale_rebase(repo_path)
    ensure_racksmith_branch(repo_path)
    statuses = get_file_statuses(repo_path)
    if statuses["modified"] or statuses["untracked"]:
        raise RuntimeError(
            "Cannot sync: you have uncommitted changes. Commit or discard them first."
        )
    base = detect_base_branch(repo_path)
    run_git(repo_path, ["rebase", f"origin/{base}"])


def _abort_stale_rebase(repo_path: Path) -> None:
    """If a previous rebase was interrupted, abort it so we can proceed."""
    rebase_merge = repo_path / ".git" / "rebase-merge"
    rebase_apply = repo_path / ".git" / "rebase-apply"
    if rebase_merge.is_dir() or rebase_apply.is_dir():
        run_git(repo_path, ["rebase", "--abort"])


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


def get_file_diffs(
    repo_path: Path,
    *,
    racksmith_prefix: str | None = None,
) -> list[dict]:
    """Return list of {path, status, diff} for modified and untracked files.

    When racksmith_prefix is provided, only include paths under that prefix.
    Returned path in each dict is racksmith-relative.
    """
    statuses = get_file_statuses(repo_path, racksmith_prefix=racksmith_prefix)
    result: list[dict] = []
    for path in statuses["modified"]:
        repo_rel = f"{racksmith_prefix}/{path}" if racksmith_prefix else path
        full_path = repo_path / repo_rel
        if not full_path.exists():
            diff_result = run_git(
                repo_path, ["diff", "--no-color", "--", repo_rel], check=False
            )
            result.append({"path": path, "status": "deleted", "diff": diff_result.stdout or ""})
            continue
        if _is_binary(full_path):
            result.append({"path": path, "status": "modified", "diff": "(binary file)"})
            continue
        diff_result = run_git(repo_path, ["diff", "--no-color", repo_rel], check=False)
        result.append({"path": path, "status": "modified", "diff": diff_result.stdout or ""})
    for path in statuses["untracked"]:
        repo_rel = f"{racksmith_prefix}/{path}" if racksmith_prefix else path
        full_path = repo_path / repo_rel
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
    paths_to_add: list[str] | None = None,
) -> str | None:
    """Stage all changes, commit, push to racksmith branch, create PR, return PR URL.

    When paths_to_add is provided (repo-relative paths), only stage those paths.
    Otherwise stage everything (add -A).
    """
    try:
        remote_url = (
            f"https://x-access-token:{access_token}"
            f"@github.com/{owner}/{repo}.git"
        )
        run_git(repo_path, ["remote", "set-url", "origin", remote_url], check=False)
        if paths_to_add is not None:
            if paths_to_add:
                run_git(repo_path, ["add", "--"] + paths_to_add)
        else:
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
        run_git(repo_path, ["push", "--force-with-lease", "origin", settings.GIT_RACKSMITH_BRANCH])
    except (RuntimeError, ValueError) as exc:
        logger.error("git_commit_push_failed", owner=owner, repo=repo, error=_sanitize_error(str(exc)[:200]))
        raise

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
            f"{settings.GITHUB_API_BASE}/repos/{owner}/{repo}/pulls",
            headers=headers,
            json={
                "title": f"Merge racksmith into {base}",
                "head": settings.GIT_RACKSMITH_BRANCH,
                "base": base,
            },
        )
        if resp.status_code == 201:
            pr_url = resp.json().get("html_url")
            logger.info("pr_created", owner=owner, repo=repo, base=base)
            return pr_url
        if resp.status_code == 422:
            list_resp = client.get(
                f"{settings.GITHUB_API_BASE}/repos/{owner}/{repo}/pulls",
                headers=headers,
                params={"head": f"{owner}:{settings.GIT_RACKSMITH_BRANCH}", "base": base, "state": "open"},
            )
            if list_resp.status_code == 200 and list_resp.json():
                pr_url = list_resp.json()[0].get("html_url")
                logger.info("pr_created", owner=owner, repo=repo, base=base)
                return pr_url
        return None


def slugify_branch_name(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    if not slug:
        slug = "changes"
    stamp = datetime.now(UTC).strftime("%Y%m%d%H%M%S")
    return f"racksmith/{slug[:40]}-{stamp}"
