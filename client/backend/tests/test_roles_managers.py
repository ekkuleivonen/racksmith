"""Unit tests for roles/managers."""

from __future__ import annotations

from unittest.mock import patch

import pytest

from roles.managers import role_manager
from roles.schemas import RoleCreate


@pytest.fixture
def with_repo_mock(with_roles_repo_mock):
    return with_roles_repo_mock


class TestRoleManagerListRoles:
    def test_empty_when_no_repo(self, mock_session):
        with patch("_utils.repo_helpers.repos_manager") as m:
            from _utils.exceptions import RepoNotAvailableError
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
        role = next(r for r in result if r.id == "install_packages")
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
        assert role.id == "my_role"
        assert role.name == "my_role"

    def test_get_role_not_found_raises(self, with_repo_mock):
        with pytest.raises(FileNotFoundError, match="not found"):
            role_manager.get_role(with_repo_mock, "nonexistent")


class TestRoleManagerCreateRole:
    def test_create_role(self, with_repo_mock):
        body = RoleCreate(
            name="New Role",
            description="A new role",
            tasks=[{"name": "debug", "debug": {"msg": "hello"}}],
        )
        role = role_manager.create_role(with_repo_mock, body)
        assert role.id.startswith("role_")
        assert role.name == "New Role"

    def test_create_role_generates_unique_id(self, with_repo_mock):
        body = RoleCreate(name="My Role", description="First")
        role1 = role_manager.create_role(with_repo_mock, body)
        body2 = RoleCreate(name="My Role 2", description="Second")
        role2 = role_manager.create_role(with_repo_mock, body2)
        assert role1.id != role2.id
        assert role1.id.startswith("role_")
        assert role2.id.startswith("role_")


class TestRoleManagerAcceptsListDictInputs:
    def test_accepts_list_input(self, with_repo_mock):
        body = RoleCreate(
            name="Good",
            description="Has list input",
            inputs=[{"key": "dirs", "type": "list", "label": "Dirs"}],
            tasks=[{"name": "noop", "debug": {"msg": "ok"}}],
        )
        role = role_manager.create_role(with_repo_mock, body)
        assert any(i.type == "list" for i in role.inputs)

    def test_accepts_dict_input(self, with_repo_mock):
        body = RoleCreate(
            name="Good",
            description="Has dict input",
            inputs=[{"key": "opts", "type": "dict", "label": "Opts"}],
            tasks=[{"name": "noop", "debug": {"msg": "ok"}}],
        )
        role = role_manager.create_role(with_repo_mock, body)
        assert any(i.type == "dict" for i in role.inputs)


class TestRoleLabelDerivation:
    def test_label_from_humanized_key_description_in_tooltip(self, with_repo_mock, layout):
        layout.roles_path.mkdir(parents=True, exist_ok=True)
        (layout.roles_path / "role_abc").mkdir()
        (layout.roles_path / "role_abc" / "meta").mkdir()
        (layout.roles_path / "role_abc" / "meta" / "main.yml").write_text("""
galaxy_info:
  role_name: SSH Hardening
argument_specs:
  main:
    options:
      enable_pubkey:
        type: bool
        description: Enable Public Key Authentication
""")
        role = role_manager.get_role(with_repo_mock, "role_abc")
        assert len(role.inputs) == 1
        assert role.inputs[0].label == "Enable Pubkey"
        assert role.inputs[0].description == "Enable Public Key Authentication"

    def test_label_falls_back_to_humanized_key(self, with_repo_mock, layout):
        layout.roles_path.mkdir(parents=True, exist_ok=True)
        (layout.roles_path / "role_xyz").mkdir()
        (layout.roles_path / "role_xyz" / "meta").mkdir()
        (layout.roles_path / "role_xyz" / "meta" / "main.yml").write_text("""
galaxy_info:
  role_name: Test
argument_specs:
  main:
    options:
      allow_root_login:
        type: bool
""")
        role = role_manager.get_role(with_repo_mock, "role_xyz")
        assert role.inputs[0].label == "Allow Root Login"


class TestRoleOutputsInManager:
    def test_role_summary_includes_outputs(self, with_repo_mock, layout):
        import yaml as _yaml

        from core.racksmith_meta import RacksmithMeta, write_meta

        layout.roles_path.mkdir(parents=True, exist_ok=True)
        (layout.roles_path / "storage_discover").mkdir()
        (layout.roles_path / "storage_discover" / "meta").mkdir()
        (layout.roles_path / "storage_discover" / "meta" / "main.yml").write_text(
            _yaml.safe_dump({
                "galaxy_info": {"role_name": "Storage Discover", "description": "Discover disk"},
                "argument_specs": {"main": {"options": {}}},
            })
        )
        meta = RacksmithMeta()
        meta.roles["storage_discover"] = {
            "outputs": [{"key": "discovered_uuid", "description": "Filesystem UUID"}],
        }
        write_meta(layout, meta)
        role = role_manager.get_role(with_repo_mock, "storage_discover")
        assert len(role.outputs) == 1
        assert role.outputs[0].key == "discovered_uuid"

    def test_roles_catalog_includes_outputs(self, with_repo_mock, layout):
        import yaml as _yaml

        from core.racksmith_meta import RacksmithMeta, write_meta
        from playbooks.managers import playbook_manager

        layout.roles_path.mkdir(parents=True, exist_ok=True)
        (layout.roles_path / "discover_role").mkdir()
        (layout.roles_path / "discover_role" / "meta").mkdir()
        (layout.roles_path / "discover_role" / "meta" / "main.yml").write_text(
            _yaml.safe_dump({
                "galaxy_info": {"role_name": "Discover", "description": "Discover"},
                "argument_specs": {"main": {"options": {}}},
            })
        )
        meta = RacksmithMeta()
        meta.roles["discover_role"] = {
            "outputs": [{"key": "disk_uuid", "description": "UUID"}],
        }
        write_meta(layout, meta)
        catalog = playbook_manager.roles_catalog(with_repo_mock)
        entry = next(e for e in catalog if e.id == "discover_role")
        assert len(entry.outputs) == 1
        assert entry.outputs[0].key == "disk_uuid"


class TestRoleManagerUpdateRole:
    def test_update_role(self, with_repo_mock, layout):
        from roles.schemas import RoleUpdate

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
        body = RoleUpdate(yaml_text=yaml_text)
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
