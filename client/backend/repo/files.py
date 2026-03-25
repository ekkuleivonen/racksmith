"""File tree and file operations for the active repo."""

from __future__ import annotations

import asyncio
import shutil

from _utils.exceptions import RepoNotAvailableError
from _utils.logging import get_logger
from auth.git import (
    commit_and_push as git_commit_and_push,
)
from auth.git import (
    discard_changes as git_discard_changes,
)
from auth.git import (
    ensure_racksmith_branch,
    get_racksmith_status_paths_repo_relative,
)
from auth.git import (
    get_file_diffs as get_git_file_diffs,
)
from auth.git import (
    get_file_statuses as get_git_file_statuses,
)
from auth.managers import auth_manager
from auth.session import SessionData
from auth.workspace import (
    is_yaml_path,
    safe_relative_path,
    validate_yaml_text,
    walk_tree,
)
from core.config import resolve_layout
from repo.managers import repos_manager

logger = get_logger(__name__)


class FilesManager:
    def get_tree(self, session: SessionData) -> list[dict]:
        repo_path = repos_manager.active_repo_path(session)
        layout = resolve_layout(repo_path)
        if not layout.racksmith_base.exists():
            return []
        return walk_tree(layout.racksmith_base)

    def get_file(self, session: SessionData, path: str) -> str:
        repo_path = repos_manager.active_repo_path(session)
        layout = resolve_layout(repo_path)
        file_path = safe_relative_path(layout.racksmith_base, path)
        if not file_path.exists() or not file_path.is_file():
            raise FileNotFoundError("File not found")
        try:
            return file_path.read_text(encoding="utf-8")
        except UnicodeDecodeError as exc:
            raise ValueError("Binary file") from exc

    def update_file(self, session: SessionData, path: str, content: str) -> None:
        repo_path = repos_manager.active_repo_path(session)
        layout = resolve_layout(repo_path)
        file_path = safe_relative_path(layout.racksmith_base, path)
        if not file_path.exists() or not file_path.is_file():
            raise FileNotFoundError("File not found")
        if "\x00" in content:
            raise ValueError("Binary content is not supported")
        if is_yaml_path(path):
            validate_yaml_text(content)
        file_path.write_text(content, encoding="utf-8")

    def create_file(self, session: SessionData, path: str, content: str) -> None:
        repo_path = repos_manager.active_repo_path(session)
        layout = resolve_layout(repo_path)
        file_path = safe_relative_path(layout.racksmith_base, path)
        if file_path.exists():
            raise ValueError("File already exists")
        if "\x00" in content:
            raise ValueError("Binary content is not supported")
        if is_yaml_path(path):
            validate_yaml_text(content)
        file_path.parent.mkdir(parents=True, exist_ok=True)
        file_path.write_text(content, encoding="utf-8")

    def delete_file(self, session: SessionData, path: str) -> None:
        repo_path = repos_manager.active_repo_path(session)
        layout = resolve_layout(repo_path)
        file_path = safe_relative_path(layout.racksmith_base, path)
        if not file_path.exists():
            raise FileNotFoundError("File not found")
        if not file_path.is_file():
            raise ValueError("Cannot delete directory")
        file_path.unlink(missing_ok=True)

    def create_folder(self, session: SessionData, path: str) -> None:
        repo_path = repos_manager.active_repo_path(session)
        layout = resolve_layout(repo_path)
        folder_path = safe_relative_path(layout.racksmith_base, path)
        if folder_path.exists():
            raise ValueError("Already exists")
        folder_path.mkdir(parents=True, exist_ok=True)

    def delete_folder(self, session: SessionData, path: str) -> None:
        repo_path = repos_manager.active_repo_path(session)
        layout = resolve_layout(repo_path)
        folder_path = safe_relative_path(layout.racksmith_base, path)
        if not folder_path.exists():
            raise FileNotFoundError("Folder not found")
        if not folder_path.is_dir():
            raise ValueError("Not a directory")
        shutil.rmtree(folder_path)

    def move_entry(self, session: SessionData, src: str, dest: str) -> None:
        repo_path = repos_manager.active_repo_path(session)
        layout = resolve_layout(repo_path)
        src_path = safe_relative_path(layout.racksmith_base, src)
        dest_path = safe_relative_path(layout.racksmith_base, dest)
        if not src_path.exists():
            raise FileNotFoundError("Source not found")
        if dest_path.exists():
            raise ValueError("Destination already exists")
        dest_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(src_path), str(dest_path))

    async def get_file_statuses(self, session: SessionData) -> dict[str, list[str]]:
        repo_path = repos_manager.active_repo_path(session)
        layout = resolve_layout(repo_path)
        prefix = layout.racksmith_prefix if layout.racksmith_prefix else None
        return await asyncio.to_thread(get_git_file_statuses, repo_path, racksmith_prefix=prefix)

    async def get_diffs(self, session: SessionData) -> list[dict]:
        repo_path = repos_manager.active_repo_path(session)
        layout = resolve_layout(repo_path)
        prefix = layout.racksmith_prefix if layout.racksmith_prefix else None

        def _diffs() -> list[dict]:
            ensure_racksmith_branch(repo_path)
            return get_git_file_diffs(repo_path, racksmith_prefix=prefix)

        return await asyncio.to_thread(_diffs)

    async def commit_and_push(self, session: SessionData, message: str) -> str | None:
        binding = repos_manager.current_repo(session)
        if not binding:
            raise RepoNotAvailableError("Active repo is not configured")
        repo_path = repos_manager.active_repo_path(session)
        layout = resolve_layout(repo_path)
        paths_to_add: list[str] | None = None
        if layout.racksmith_prefix:
            paths_to_add = get_racksmith_status_paths_repo_relative(
                repo_path, layout.racksmith_prefix
            )

        access_token = await auth_manager.ensure_fresh_token(session)

        def _commit() -> str | None:
            return git_commit_and_push(
                repo_path,
                message,
                access_token,
                binding.owner,
                binding.repo,
                paths_to_add=paths_to_add,
            )

        result = await asyncio.to_thread(_commit)
        if result:
            logger.info("repo_committed_and_pushed", message=message[:80], owner=binding.owner, repo=binding.repo)
        return result

    async def discard_changes(self, session: SessionData) -> None:
        repo_path = repos_manager.active_repo_path(session)
        await asyncio.to_thread(git_discard_changes, repo_path)
        binding = repos_manager.current_repo(session)
        if binding:
            logger.info("repo_changes_discarded", owner=binding.owner, repo=binding.repo)


files_manager = FilesManager()
