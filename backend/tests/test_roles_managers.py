"""Unit tests for roles/managers."""

from __future__ import annotations

from unittest.mock import patch

import pytest

from roles.managers import role_manager
from roles.schemas import RoleCreateRequest


@pytest.fixture
def with_repo_mock(mock_session, repo_path):
    """Patch repos_manager.active_repo_path to return repo_path."""
    with patch("roles.managers.repos_manager") as m:
        m.active_repo_path.return_value = repo_path
        yield mock_session


class TestRoleManagerListRoles:
    def test_empty_when_no_repo(self, mock_session):
        with patch("roles.managers.repos_manager") as m:
            from github.misc import RepoNotAvailableError
            m.active_repo_path.side_effect = RepoNotAvailableError("no repo")
            result = role_manager.list_roles(mock_session)
        assert result == []

    def test_empty_returns_empty(self, with_repo_mock):
        result = role_manager.list_roles(with_repo_mock)
        assert result == []

    def test_lists_roles(self, with_repo_mock, layout):
        layout.roles_path.mkdir(parents=True, exist_ok=True)
        (layout.roles_path / "install_packages").mkdir()
        (layout.roles_path / "install_packages" / "meta").mkdir()
        (layout.roles_path / "install_packages" / "meta" / "main.yml").write_text("""
galaxy_info:
  role_name: install_packages
  description: Install system packages
""")
        result = role_manager.list_roles(with_repo_mock)
        assert len(result) >= 1
        role = next(r for r in result if r.slug == "install_packages")
        assert role.name == "install_packages"


class TestRoleManagerGetRole:
    def test_get_role_found(self, with_repo_mock, layout):
        layout.roles_path.mkdir(parents=True, exist_ok=True)
        (layout.roles_path / "my_role").mkdir()
        (layout.roles_path / "my_role" / "meta").mkdir()
        (layout.roles_path / "my_role" / "meta" / "main.yml").write_text("""
galaxy_info:
  role_name: my_role
  description: My test role
""")
        role = role_manager.get_role(with_repo_mock, "my_role")
        assert role.slug == "my_role"
        assert role.name == "my_role"

    def test_get_role_not_found_raises(self, with_repo_mock):
        with pytest.raises(FileNotFoundError, match="not found"):
            role_manager.get_role(with_repo_mock, "nonexistent")


class TestRoleManagerCreateRole:
    def test_create_role(self, with_repo_mock):
        body = RoleCreateRequest(
            slug="new-role",
            name="New Role",
            description="A new role",
            tasks=[{"name": "debug", "debug": {"msg": "hello"}}],
        )
        role = role_manager.create_role(with_repo_mock, body)
        assert role.slug == "new-role"
        assert role.name == "New Role"

    def test_create_role_duplicate_slug_raises(self, with_repo_mock, layout):
        layout.roles_path.mkdir(parents=True, exist_ok=True)
        (layout.roles_path / "existing").mkdir()
        body = RoleCreateRequest(slug="existing", name="Existing", description="")
        with pytest.raises(ValueError, match="already exists"):
            role_manager.create_role(with_repo_mock, body)


class TestRoleManagerUpdateRole:
    def test_update_role(self, with_repo_mock, layout):
        from roles.schemas import RoleUpdateRequest

        layout.roles_path.mkdir(parents=True, exist_ok=True)
        (layout.roles_path / "my-role").mkdir()
        (layout.roles_path / "my-role" / "meta").mkdir()
        (layout.roles_path / "my-role" / "meta" / "main.yml").write_text("""
galaxy_info:
  role_name: my-role
  description: Old desc
""")
        yaml_text = """
name: my-role
description: Updated desc
labels: []
compatibility:
  os_family: []
inputs: []
"""
        body = RoleUpdateRequest(yaml_text=yaml_text)
        detail = role_manager.update_role(with_repo_mock, "my-role", body)
        assert detail.description == "Updated desc"


class TestRoleManagerDeleteRole:
    def test_delete_role(self, with_repo_mock, layout):
        layout.roles_path.mkdir(parents=True, exist_ok=True)
        (layout.roles_path / "to_delete").mkdir()
        (layout.roles_path / "to_delete" / "meta").mkdir()
        (layout.roles_path / "to_delete" / "meta" / "main.yml").write_text("""
galaxy_info:
  role_name: to_delete
""")
        role_manager.delete_role(with_repo_mock, "to_delete")
        with pytest.raises(FileNotFoundError, match="not found"):
            role_manager.get_role(with_repo_mock, "to_delete")
