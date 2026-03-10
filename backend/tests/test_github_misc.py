"""Unit tests for github.misc pure utilities."""

from __future__ import annotations

from pathlib import Path

import pytest

from github.misc import (
    REPO_NAME_RE,
    is_yaml_path,
    safe_relative_path,
    safe_slug,
    user_login,
    user_storage_id,
    validate_yaml_text,
    walk_tree,
)


class TestSafeRelativePath:
    def test_rejects_empty_path(self) -> None:
        root = Path("/tmp/repo")
        with pytest.raises(ValueError, match="Invalid path"):
            safe_relative_path(root, "")

    def test_rejects_leading_slash(self) -> None:
        root = Path("/tmp/repo")
        with pytest.raises(ValueError, match="Invalid path"):
            safe_relative_path(root, "/foo/bar")

    def test_rejects_parent_ref(self) -> None:
        root = Path("/tmp/repo")
        with pytest.raises(ValueError, match="Invalid path"):
            safe_relative_path(root, "foo/../bar")

    def test_rejects_path_outside_repo(self, tmp_path: Path) -> None:
        root = tmp_path / "repo"
        root.mkdir()
        with pytest.raises(ValueError, match="Invalid path"):
            safe_relative_path(root, "..")

    def test_accepts_valid_relative_path(self, tmp_path: Path) -> None:
        root = tmp_path / "repo"
        root.mkdir()
        (root / "foo").mkdir()
        result = safe_relative_path(root, "foo/bar.txt")
        assert result == root / "foo" / "bar.txt"

    def test_resolves_to_absolute_inside_repo(self, tmp_path: Path) -> None:
        root = tmp_path / "repo"
        root.mkdir()
        result = safe_relative_path(root, "file.yml")
        assert result.resolve() == (root / "file.yml").resolve()


class TestSafeSlug:
    def test_strips_invalid_chars(self) -> None:
        assert safe_slug("My Rack #1") == "my-rack-1"

    def test_lowercases(self) -> None:
        assert safe_slug("UPPERCASE") == "uppercase"

    def test_strips_trailing_hyphens(self) -> None:
        assert safe_slug("  foo---  ") == "foo"

    def test_empty_becomes_rack(self) -> None:
        assert safe_slug("") == "rack"
        assert safe_slug("   ---   ") == "rack"


class TestUserStorageId:
    def test_extracts_id(self) -> None:
        assert user_storage_id({"id": 12345}) == "12345"
        assert user_storage_id({"id": "abc"}) == "abc"

    def test_raises_when_missing(self) -> None:
        with pytest.raises(ValueError, match="Missing GitHub user id"):
            user_storage_id({})
        with pytest.raises(ValueError, match="Missing GitHub user id"):
            user_storage_id({"id": None})
        with pytest.raises(ValueError, match="Missing GitHub user id"):
            user_storage_id({"id": ""})


class TestUserLogin:
    def test_extracts_login(self) -> None:
        assert user_login({"login": "octocat"}) == "octocat"

    def test_empty_when_missing(self) -> None:
        assert user_login({}) == ""
        assert user_login({"login": None}) == ""

    def test_strips_whitespace(self) -> None:
        assert user_login({"login": "  user  "}) == "user"


class TestIsYamlPath:
    def test_accepts_yml(self) -> None:
        assert is_yaml_path("file.yml") is True
        assert is_yaml_path("path/to/file.yml") is True

    def test_accepts_yaml(self) -> None:
        assert is_yaml_path("file.yaml") is True
        assert is_yaml_path("config.YAML") is True

    def test_rejects_other_extensions(self) -> None:
        assert is_yaml_path("file.txt") is False
        assert is_yaml_path("file.json") is False
        assert is_yaml_path("file") is False


class TestValidateYamlText:
    def test_accepts_valid_yaml(self) -> None:
        validate_yaml_text("key: value")
        validate_yaml_text("---\nlist:\n  - a\n  - b")

    def test_raises_on_invalid_yaml(self) -> None:
        with pytest.raises(ValueError, match="Invalid YAML"):
            validate_yaml_text("invalid: [unclosed")
        with pytest.raises(ValueError):
            validate_yaml_text("]\ninvalid")


class TestWalkTree:
    def test_empty_dir_returns_empty(self, tmp_path: Path) -> None:
        assert walk_tree(tmp_path) == []

    def test_excludes_git(self, tmp_path: Path) -> None:
        (tmp_path / ".git").mkdir()
        (tmp_path / "file.txt").write_text("x")
        entries = walk_tree(tmp_path)
        names = [e["name"] for e in entries]
        assert ".git" not in names
        assert "file.txt" in names

    def test_returns_structure(self, tmp_path: Path) -> None:
        (tmp_path / "a.txt").write_text("a")
        (tmp_path / "subdir").mkdir()
        (tmp_path / "subdir" / "b.txt").write_text("b")
        entries = walk_tree(tmp_path)
        assert len(entries) == 2
        file_entries = [e for e in entries if e["type"] == "file"]
        dir_entries = [e for e in entries if e["type"] == "dir"]
        assert len(file_entries) == 1
        assert file_entries[0]["name"] == "a.txt"
        assert len(dir_entries) == 1
        assert dir_entries[0]["name"] == "subdir"
        assert len(dir_entries[0]["children"]) == 1
        assert dir_entries[0]["children"][0]["name"] == "b.txt"


class TestRepoNameRe:
    def test_valid_names(self) -> None:
        assert REPO_NAME_RE.match("owner")
        assert REPO_NAME_RE.match("owner-repo")
        assert REPO_NAME_RE.match("owner_repo")
        assert REPO_NAME_RE.match("user.name")

    def test_invalid_names(self) -> None:
        assert not REPO_NAME_RE.match("owner/repo")
        assert not REPO_NAME_RE.match("owner repo")
        assert not REPO_NAME_RE.match("")
