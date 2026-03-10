"""Unit tests for code/managers.

Note: run_tests.py loads stdlib 'code', shadowing our backend/code package.
We load our code.managers via importlib to avoid the conflict.
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from unittest.mock import patch

import pytest

_backend = Path(__file__).resolve().parent.parent
_spec = importlib.util.spec_from_file_location(
    "_code_managers",
    _backend / "code" / "managers.py",
)
_code_managers = importlib.util.module_from_spec(_spec)
sys.modules["_code_managers"] = _code_managers
_spec.loader.exec_module(_code_managers)
code_manager = _code_managers.code_manager


@pytest.fixture
def with_repo_mock(mock_session, repo_path):
    """Patch repos_manager.active_repo_path to return repo_path."""
    with patch.object(_code_managers, "repos_manager") as m:
        m.active_repo_path.return_value = repo_path
        yield mock_session


class TestCodeManagerGetTree:
    def test_get_tree_empty(self, with_repo_mock):
        result = code_manager.get_tree(with_repo_mock)
        assert result == []

    def test_get_tree_excludes_git(self, with_repo_mock, repo_path):
        (repo_path / ".git").mkdir()
        (repo_path / "readme.txt").write_text("hello")
        result = code_manager.get_tree(with_repo_mock)
        names = [e["name"] for e in result]
        assert ".git" not in names
        assert "readme.txt" in names

    def test_get_tree_structure(self, with_repo_mock, repo_path):
        (repo_path / "a.txt").write_text("a")
        (repo_path / "subdir").mkdir()
        (repo_path / "subdir" / "b.txt").write_text("b")
        result = code_manager.get_tree(with_repo_mock)
        assert len(result) == 2


class TestCodeManagerGetFile:
    def test_get_file(self, with_repo_mock, repo_path):
        (repo_path / "file.txt").write_text("content")
        result = code_manager.get_file(with_repo_mock, "file.txt")
        assert result == "content"

    def test_get_file_not_found_raises(self, with_repo_mock):
        with pytest.raises(FileNotFoundError, match="not found"):
            code_manager.get_file(with_repo_mock, "nonexistent.txt")

    def test_get_file_invalid_path_raises(self, with_repo_mock):
        with pytest.raises(ValueError, match="Invalid path"):
            code_manager.get_file(with_repo_mock, "../etc/passwd")


class TestCodeManagerUpdateFile:
    def test_update_file(self, with_repo_mock, repo_path):
        (repo_path / "file.txt").write_text("old")
        code_manager.update_file(with_repo_mock, "file.txt", "new")
        assert (repo_path / "file.txt").read_text() == "new"

    def test_update_file_binary_content_raises(self, with_repo_mock, repo_path):
        (repo_path / "file.txt").write_text("old")
        with pytest.raises(ValueError, match="Binary content"):
            code_manager.update_file(with_repo_mock, "file.txt", "text\x00binary")

    def test_update_file_yaml_validated(self, with_repo_mock, repo_path):
        (repo_path / "config.yml").write_text("key: value")
        code_manager.update_file(with_repo_mock, "config.yml", "key: updated")
        assert (repo_path / "config.yml").read_text() == "key: updated"

    def test_update_file_invalid_yaml_raises(self, with_repo_mock, repo_path):
        (repo_path / "config.yml").write_text("key: value")
        with pytest.raises(ValueError, match="Invalid YAML"):
            code_manager.update_file(with_repo_mock, "config.yml", "invalid: [unclosed")


class TestCodeManagerCreateFile:
    def test_create_file(self, with_repo_mock, repo_path):
        code_manager.create_file(with_repo_mock, "new.txt", "content")
        assert (repo_path / "new.txt").read_text() == "content"

    def test_create_file_nested(self, with_repo_mock, repo_path):
        code_manager.create_file(with_repo_mock, "dir/sub/file.txt", "content")
        assert (repo_path / "dir" / "sub" / "file.txt").read_text() == "content"

    def test_create_file_exists_raises(self, with_repo_mock, repo_path):
        (repo_path / "exists.txt").write_text("x")
        with pytest.raises(ValueError, match="already exists"):
            code_manager.create_file(with_repo_mock, "exists.txt", "y")


class TestCodeManagerDeleteFile:
    def test_delete_file(self, with_repo_mock, repo_path):
        (repo_path / "file.txt").write_text("x")
        code_manager.delete_file(with_repo_mock, "file.txt")
        assert not (repo_path / "file.txt").exists()

    def test_delete_file_directory_raises(self, with_repo_mock, repo_path):
        (repo_path / "dir").mkdir()
        with pytest.raises(ValueError, match="Cannot delete directory"):
            code_manager.delete_file(with_repo_mock, "dir")


class TestCodeManagerCreateFolder:
    def test_create_folder(self, with_repo_mock, repo_path):
        code_manager.create_folder(with_repo_mock, "newdir")
        assert (repo_path / "newdir").is_dir()

    def test_create_folder_exists_raises(self, with_repo_mock, repo_path):
        (repo_path / "exists").mkdir()
        with pytest.raises(ValueError, match="Already exists"):
            code_manager.create_folder(with_repo_mock, "exists")


class TestCodeManagerDeleteFolder:
    def test_delete_folder(self, with_repo_mock, repo_path):
        (repo_path / "dir").mkdir()
        code_manager.delete_folder(with_repo_mock, "dir")
        assert not (repo_path / "dir").exists()

    def test_delete_folder_not_dir_raises(self, with_repo_mock, repo_path):
        (repo_path / "file.txt").write_text("x")
        with pytest.raises(ValueError, match="Not a directory"):
            code_manager.delete_folder(with_repo_mock, "file.txt")


class TestCodeManagerMoveEntry:
    def test_move_file(self, with_repo_mock, repo_path):
        (repo_path / "src.txt").write_text("content")
        code_manager.move_entry(with_repo_mock, "src.txt", "dest.txt")
        assert not (repo_path / "src.txt").exists()
        assert (repo_path / "dest.txt").read_text() == "content"

    def test_move_destination_exists_raises(self, with_repo_mock, repo_path):
        (repo_path / "src.txt").write_text("a")
        (repo_path / "dest.txt").write_text("b")
        with pytest.raises(ValueError, match="already exists"):
            code_manager.move_entry(with_repo_mock, "src.txt", "dest.txt")
