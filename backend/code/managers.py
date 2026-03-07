"""File tree and code operations for the active repo."""

from __future__ import annotations

import shutil

from github.misc import (
    commit_and_push as git_commit_and_push,
    ensure_racksmith_branch,
    get_file_diffs as get_git_file_diffs,
    get_file_statuses as get_git_file_statuses,
    is_yaml_path,
    safe_relative_path,
    validate_yaml_text,
    walk_tree,
)
from setup.managers import setup_manager


class CodeManager:
    def get_tree(self, session) -> list[dict]:
        return walk_tree(setup_manager.active_repo_path(session))

    def get_file(self, session, path: str) -> str:
        repo_path = setup_manager.active_repo_path(session)
        file_path = safe_relative_path(repo_path, path)
        if not file_path.exists() or not file_path.is_file():
            raise FileNotFoundError("File not found")
        try:
            return file_path.read_text(encoding="utf-8")
        except UnicodeDecodeError as exc:
            raise ValueError("Binary file") from exc

    def update_file(self, session, path: str, content: str) -> None:
        repo_path = setup_manager.active_repo_path(session)
        file_path = safe_relative_path(repo_path, path)
        if not file_path.exists() or not file_path.is_file():
            raise FileNotFoundError("File not found")
        if "\x00" in content:
            raise ValueError("Binary content is not supported")
        if is_yaml_path(path):
            validate_yaml_text(content)
        file_path.write_text(content, encoding="utf-8")

    def create_file(self, session, path: str, content: str) -> None:
        repo_path = setup_manager.active_repo_path(session)
        file_path = safe_relative_path(repo_path, path)
        if file_path.exists():
            raise ValueError("File already exists")
        if "\x00" in content:
            raise ValueError("Binary content is not supported")
        if is_yaml_path(path):
            validate_yaml_text(content)
        file_path.parent.mkdir(parents=True, exist_ok=True)
        file_path.write_text(content, encoding="utf-8")

    def delete_file(self, session, path: str) -> None:
        repo_path = setup_manager.active_repo_path(session)
        file_path = safe_relative_path(repo_path, path)
        if not file_path.exists():
            raise FileNotFoundError("File not found")
        if not file_path.is_file():
            raise ValueError("Cannot delete directory")
        file_path.unlink(missing_ok=True)

    def create_folder(self, session, path: str) -> None:
        repo_path = setup_manager.active_repo_path(session)
        folder_path = safe_relative_path(repo_path, path)
        if folder_path.exists():
            raise ValueError("Already exists")
        folder_path.mkdir(parents=True, exist_ok=True)

    def delete_folder(self, session, path: str) -> None:
        repo_path = setup_manager.active_repo_path(session)
        folder_path = safe_relative_path(repo_path, path)
        if not folder_path.exists():
            raise FileNotFoundError("Folder not found")
        if not folder_path.is_dir():
            raise ValueError("Not a directory")
        shutil.rmtree(folder_path)

    def move_entry(self, session, src: str, dest: str) -> None:
        repo_path = setup_manager.active_repo_path(session)
        src_path = safe_relative_path(repo_path, src)
        dest_path = safe_relative_path(repo_path, dest)
        if not src_path.exists():
            raise FileNotFoundError("Source not found")
        if dest_path.exists():
            raise ValueError("Destination already exists")
        dest_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(src_path), str(dest_path))

    def get_file_statuses(self, session) -> dict[str, list[str]]:
        return get_git_file_statuses(setup_manager.active_repo_path(session))

    def get_diffs(self, session) -> list[dict]:
        repo_path = setup_manager.active_repo_path(session)
        ensure_racksmith_branch(repo_path)
        return get_git_file_diffs(repo_path)

    def commit_and_push(self, session, message: str) -> str | None:
        binding = setup_manager.current_repo(session)
        if not binding:
            raise FileNotFoundError("Active repo is not configured")
        repo_path = setup_manager.active_repo_path(session)
        return git_commit_and_push(
            repo_path,
            message,
            session.access_token,
            binding.owner,
            binding.repo,
        )


code_manager = CodeManager()
