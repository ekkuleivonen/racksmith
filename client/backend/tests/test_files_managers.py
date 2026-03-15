"""Unit tests for files/managers."""

from __future__ import annotations

from pathlib import Path
from unittest.mock import patch

import pytest

import repo.files as _files_managers
from repo.files import files_manager


@pytest.fixture
def racksmith_repo(repo_path):
    """Repo path with .racksmith directory; all file paths are racksmith-relative."""
    (repo_path / ".racksmith").mkdir(parents=True, exist_ok=True)
    return repo_path


@pytest.fixture
def with_repo_mock(mock_session, racksmith_repo):
    """Patch repos_manager.active_repo_path to return repo with .racksmith."""
    with patch.object(_files_managers, "repos_manager") as m:
        m.active_repo_path.return_value = racksmith_repo
        yield mock_session


def _r(repo: Path, *parts: str) -> Path:
    """Path under .racksmith (racksmith-relative)."""
    return repo / ".racksmith" / Path(*parts)


class TestFilesManagerGetTree:
    def test_get_tree_empty(self, with_repo_mock, racksmith_repo):
        result = files_manager.get_tree(with_repo_mock)
        assert result == []

    def test_get_tree_missing_racksmith_returns_empty(self, mock_session, tmp_path):
        """When .racksmith does not exist, return empty tree."""
        with patch.object(_files_managers, "repos_manager") as m:
            m.active_repo_path.return_value = tmp_path
            result = files_manager.get_tree(mock_session)
        assert result == []

    def test_get_tree_excludes_git(self, with_repo_mock, racksmith_repo):
        (racksmith_repo / ".racksmith" / ".git").mkdir(parents=True)
        (racksmith_repo / ".racksmith" / "readme.txt").write_text("hello")
        result = files_manager.get_tree(with_repo_mock)
        names = [e["name"] for e in result]
        assert ".git" not in names
        assert "readme.txt" in names

    def test_get_tree_structure(self, with_repo_mock, racksmith_repo):
        (racksmith_repo / ".racksmith" / "a.txt").write_text("a")
        (racksmith_repo / ".racksmith" / "subdir").mkdir()
        (racksmith_repo / ".racksmith" / "subdir" / "b.txt").write_text("b")
        result = files_manager.get_tree(with_repo_mock)
        assert len(result) == 2


class TestFilesManagerGetFile:
    def test_get_file(self, with_repo_mock, racksmith_repo):
        _r(racksmith_repo, "file.txt").write_text("content")
        result = files_manager.get_file(with_repo_mock, "file.txt")
        assert result == "content"

    def test_get_file_not_found_raises(self, with_repo_mock):
        with pytest.raises(FileNotFoundError, match="not found"):
            files_manager.get_file(with_repo_mock, "nonexistent.txt")

    def test_get_file_invalid_path_raises(self, with_repo_mock):
        with pytest.raises(ValueError, match="Invalid path"):
            files_manager.get_file(with_repo_mock, "../etc/passwd")


class TestFilesManagerUpdateFile:
    def test_update_file(self, with_repo_mock, racksmith_repo):
        _r(racksmith_repo, "file.txt").write_text("old")
        files_manager.update_file(with_repo_mock, "file.txt", "new")
        assert _r(racksmith_repo, "file.txt").read_text() == "new"

    def test_update_file_binary_content_raises(self, with_repo_mock, racksmith_repo):
        _r(racksmith_repo, "file.txt").write_text("old")
        with pytest.raises(ValueError, match="Binary content"):
            files_manager.update_file(with_repo_mock, "file.txt", "text\x00binary")

    def test_update_file_yaml_validated(self, with_repo_mock, racksmith_repo):
        _r(racksmith_repo, "config.yml").write_text("key: value")
        files_manager.update_file(with_repo_mock, "config.yml", "key: updated")
        assert _r(racksmith_repo, "config.yml").read_text() == "key: updated"

    def test_update_file_invalid_yaml_raises(self, with_repo_mock, racksmith_repo):
        _r(racksmith_repo, "config.yml").write_text("key: value")
        with pytest.raises(ValueError, match="Invalid YAML"):
            files_manager.update_file(with_repo_mock, "config.yml", "invalid: [unclosed")


class TestFilesManagerCreateFile:
    def test_create_file(self, with_repo_mock, racksmith_repo):
        files_manager.create_file(with_repo_mock, "new.txt", "content")
        assert _r(racksmith_repo, "new.txt").read_text() == "content"

    def test_create_file_nested(self, with_repo_mock, racksmith_repo):
        files_manager.create_file(with_repo_mock, "dir/sub/file.txt", "content")
        assert _r(racksmith_repo, "dir/sub/file.txt").read_text() == "content"

    def test_create_file_exists_raises(self, with_repo_mock, racksmith_repo):
        _r(racksmith_repo, "exists.txt").write_text("x")
        with pytest.raises(ValueError, match="already exists"):
            files_manager.create_file(with_repo_mock, "exists.txt", "y")


class TestFilesManagerDeleteFile:
    def test_delete_file(self, with_repo_mock, racksmith_repo):
        _r(racksmith_repo, "file.txt").write_text("x")
        files_manager.delete_file(with_repo_mock, "file.txt")
        assert not _r(racksmith_repo, "file.txt").exists()

    def test_delete_file_directory_raises(self, with_repo_mock, racksmith_repo):
        _r(racksmith_repo, "dir").mkdir()
        with pytest.raises(ValueError, match="Cannot delete directory"):
            files_manager.delete_file(with_repo_mock, "dir")


class TestFilesManagerCreateFolder:
    def test_create_folder(self, with_repo_mock, racksmith_repo):
        files_manager.create_folder(with_repo_mock, "newdir")
        assert _r(racksmith_repo, "newdir").is_dir()

    def test_create_folder_exists_raises(self, with_repo_mock, racksmith_repo):
        _r(racksmith_repo, "exists").mkdir()
        with pytest.raises(ValueError, match="Already exists"):
            files_manager.create_folder(with_repo_mock, "exists")


class TestFilesManagerDeleteFolder:
    def test_delete_folder(self, with_repo_mock, racksmith_repo):
        _r(racksmith_repo, "dir").mkdir()
        files_manager.delete_folder(with_repo_mock, "dir")
        assert not _r(racksmith_repo, "dir").exists()

    def test_delete_folder_not_dir_raises(self, with_repo_mock, racksmith_repo):
        _r(racksmith_repo, "file.txt").write_text("x")
        with pytest.raises(ValueError, match="Not a directory"):
            files_manager.delete_folder(with_repo_mock, "file.txt")


class TestFilesManagerMoveEntry:
    def test_move_file(self, with_repo_mock, racksmith_repo):
        _r(racksmith_repo, "src.txt").write_text("content")
        files_manager.move_entry(with_repo_mock, "src.txt", "dest.txt")
        assert not _r(racksmith_repo, "src.txt").exists()
        assert _r(racksmith_repo, "dest.txt").read_text() == "content"

    def test_move_destination_exists_raises(self, with_repo_mock, racksmith_repo):
        _r(racksmith_repo, "src.txt").write_text("a")
        _r(racksmith_repo, "dest.txt").write_text("b")
        with pytest.raises(ValueError, match="already exists"):
            files_manager.move_entry(with_repo_mock, "src.txt", "dest.txt")
