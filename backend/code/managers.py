"""File tree and code operations for the active repo."""

from __future__ import annotations

from github.misc import (
    get_modified_paths,
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

    def get_file_statuses(self, session) -> list[str]:
        return get_modified_paths(setup_manager.active_repo_path(session))


code_manager = CodeManager()
