"""Unit tests for playbooks/managers."""

from __future__ import annotations

from unittest.mock import patch

import pytest

from core.playbooks import PlaybookData, write_playbook
from core.playbooks import PlaybookRoleEntry as AnsiblePlaybookRoleEntry
from core.roles import RoleInput
from playbooks.managers import playbook_manager
from playbooks.schemas import PlaybookRoleEntry, PlaybookUpsert, TargetSelection


def _seed_role(layout, slug: str, *, inputs: list[RoleInput] | None = None) -> None:
    """Create a minimal role directory so list_roles / resolve picks it up."""
    role_dir = layout.roles_path / slug
    (role_dir / "meta").mkdir(parents=True, exist_ok=True)
    (role_dir / "tasks").mkdir(parents=True, exist_ok=True)
    (role_dir / "meta" / "main.yml").write_text(
        f"galaxy_info:\n  role_name: {slug}\n  description: Test role {slug}\n"
    )
    (role_dir / "tasks" / "main.yml").write_text("- name: noop\n  debug:\n    msg: ok\n")


def _seed_playbook(layout, playbook_id: str, roles: list[AnsiblePlaybookRoleEntry] | None = None) -> None:
    write_playbook(layout, PlaybookData(
        id=playbook_id,
        path=layout.playbooks_path / f"{playbook_id}.yml",
        name=f"Playbook {playbook_id}",
        description="Test playbook",
        roles=roles or [],
    ))


@pytest.fixture
def with_repo_mock(with_playbooks_repo_mock):
    return with_playbooks_repo_mock


class TestPlaybookManagerListPlaybooks:
    def test_empty_when_no_repo(self, mock_session):
        with patch("_utils.repo_helpers.repos_manager") as m:
            from _utils.exceptions import RepoNotAvailableError
            m.active_repo_path.side_effect = RepoNotAvailableError("no repo")
            result = playbook_manager.list_playbooks(mock_session)
        assert result == []

    def test_empty_returns_empty(self, with_repo_mock):
        result = playbook_manager.list_playbooks(with_repo_mock)
        assert result == []

    def test_lists_playbooks(self, with_repo_mock, layout):
        _seed_playbook(layout, "pb_one")
        result = playbook_manager.list_playbooks(with_repo_mock)
        assert len(result) == 1
        assert result[0].id == "pb_one"
        assert result[0].name == "Playbook pb_one"


class TestPlaybookManagerGetPlaybook:
    def test_get_playbook_found(self, with_repo_mock, layout):
        _seed_role(layout, "install_packages")
        _seed_playbook(layout, "pb_get", roles=[
            AnsiblePlaybookRoleEntry(role="install_packages"),
        ])
        pb = playbook_manager.get_playbook(with_repo_mock, "pb_get")
        assert pb.id == "pb_get"
        assert pb.name == "Playbook pb_get"
        assert len(pb.role_entries) == 1
        assert pb.role_entries[0].role_id == "install_packages"

    def test_get_playbook_not_found_raises(self, with_repo_mock):
        with pytest.raises(FileNotFoundError, match="not found"):
            playbook_manager.get_playbook(with_repo_mock, "nonexistent")


class TestPlaybookManagerCreatePlaybook:
    def test_create_playbook(self, with_repo_mock, layout):
        _seed_role(layout, "my_role")
        body = PlaybookUpsert(
            name="New Playbook",
            description="Desc",
            roles=[PlaybookRoleEntry(role_id="my_role")],
        )
        pb = playbook_manager.create_playbook(with_repo_mock, body)
        assert pb.id.startswith("playbook_")
        assert pb.name == "New Playbook"
        assert pb.description == "Desc"
        assert len(pb.role_entries) == 1

    def test_create_playbook_unknown_role_raises(self, with_repo_mock):
        body = PlaybookUpsert(
            name="Bad",
            roles=[PlaybookRoleEntry(role_id="nonexistent_role")],
        )
        with pytest.raises(ValueError, match="Unknown role"):
            playbook_manager.create_playbook(with_repo_mock, body)

    def test_create_playbook_no_roles(self, with_repo_mock):
        body = PlaybookUpsert(name="Empty PB", description="No roles")
        pb = playbook_manager.create_playbook(with_repo_mock, body)
        assert pb.name == "Empty PB"
        assert pb.role_entries == []


class TestPlaybookManagerCreateDuplicateRoles:
    def test_create_playbook_with_duplicate_roles(self, with_repo_mock, layout):
        _seed_role(layout, "storage_discover")
        body = PlaybookUpsert(
            name="Storage Setup",
            description="Discover, format, discover again",
            roles=[
                PlaybookRoleEntry(role_id="storage_discover"),
                PlaybookRoleEntry(role_id="storage_discover"),
            ],
        )
        pb = playbook_manager.create_playbook(with_repo_mock, body)
        assert len(pb.role_entries) == 2
        assert pb.role_entries[0].role_id == "storage_discover"
        assert pb.role_entries[1].role_id == "storage_discover"

    def test_update_playbook_with_duplicate_roles(self, with_repo_mock, layout):
        _seed_role(layout, "storage_discover")
        _seed_role(layout, "storage_format")
        _seed_playbook(layout, "pb_dup")
        body = PlaybookUpsert(
            name="Updated",
            roles=[
                PlaybookRoleEntry(role_id="storage_discover"),
                PlaybookRoleEntry(role_id="storage_format"),
                PlaybookRoleEntry(role_id="storage_discover"),
            ],
        )
        pb = playbook_manager.update_playbook(with_repo_mock, "pb_dup", body)
        assert len(pb.role_entries) == 3
        assert pb.role_entries[0].role_id == "storage_discover"
        assert pb.role_entries[1].role_id == "storage_format"
        assert pb.role_entries[2].role_id == "storage_discover"


class TestPlaybookManagerUpdatePlaybook:
    def test_update_playbook(self, with_repo_mock, layout):
        _seed_role(layout, "role_a")
        _seed_playbook(layout, "pb_upd")
        body = PlaybookUpsert(
            name="Updated Name",
            description="Updated desc",
            roles=[PlaybookRoleEntry(role_id="role_a")],
        )
        pb = playbook_manager.update_playbook(with_repo_mock, "pb_upd", body)
        assert pb.name == "Updated Name"
        assert pb.description == "Updated desc"
        assert len(pb.role_entries) == 1

    def test_update_missing_raises(self, with_repo_mock):
        body = PlaybookUpsert(name="X")
        with pytest.raises(FileNotFoundError, match="not found"):
            playbook_manager.update_playbook(with_repo_mock, "missing", body)


class TestPlaybookManagerDeletePlaybook:
    def test_delete_playbook(self, with_repo_mock, layout):
        _seed_playbook(layout, "pb_del")
        playbook_manager.delete_playbook(with_repo_mock, "pb_del")
        with pytest.raises(FileNotFoundError):
            playbook_manager.get_playbook(with_repo_mock, "pb_del")


class TestPlaybookManagerResolveTargets:
    def _add_hosts(self, layout):
        """Seed inventory with 2 managed hosts in group 'web'."""
        import yaml
        layout.inventory_path.mkdir(parents=True, exist_ok=True)
        (layout.inventory_path / "hosts.yml").write_text("""
all:
  hosts:
    web1:
      ansible_host: 10.0.0.1
      ansible_user: deploy
    web2:
      ansible_host: 10.0.0.2
      ansible_user: deploy
  children:
    web:
      hosts:
        web1: {}
        web2: {}
""")
        layout.host_vars_path.mkdir(parents=True, exist_ok=True)
        layout.host_vars_file("web1").write_text(yaml.safe_dump({
            "racksmith_name": "Web 1", "racksmith_managed": True, "racksmith_labels": ["prod"],
        }))
        layout.host_vars_file("web2").write_text(yaml.safe_dump({
            "racksmith_name": "Web 2", "racksmith_managed": True, "racksmith_labels": ["staging"],
        }))

    def test_resolve_all(self, with_repo_mock, layout):
        self._add_hosts(layout)
        result = playbook_manager.resolve_targets(with_repo_mock, TargetSelection())
        assert sorted(result.hosts) == ["web1", "web2"]

    def test_resolve_by_group(self, with_repo_mock, layout):
        self._add_hosts(layout)
        result = playbook_manager.resolve_targets(
            with_repo_mock, TargetSelection(groups=["web"])
        )
        assert sorted(result.hosts) == ["web1", "web2"]

    def test_resolve_by_host(self, with_repo_mock, layout):
        self._add_hosts(layout)
        result = playbook_manager.resolve_targets(
            with_repo_mock, TargetSelection(hosts=["web1"])
        )
        assert result.hosts == ["web1"]

    def test_resolve_empty_when_no_match(self, with_repo_mock, layout):
        self._add_hosts(layout)
        result = playbook_manager.resolve_targets(
            with_repo_mock, TargetSelection(groups=["nonexistent"])
        )
        assert result.hosts == []


class TestPlaybookManagerRolesCatalog:
    def test_roles_catalog_empty(self, with_repo_mock):
        result = playbook_manager.roles_catalog(with_repo_mock)
        assert result == []

    def test_roles_catalog_lists_roles(self, with_repo_mock, layout):
        _seed_role(layout, "install_packages")
        result = playbook_manager.roles_catalog(with_repo_mock)
        assert len(result) >= 1
        ids = [r.id for r in result]
        assert "install_packages" in ids
