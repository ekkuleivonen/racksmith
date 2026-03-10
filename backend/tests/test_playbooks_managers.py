"""Unit tests for playbooks/managers."""

from __future__ import annotations

from unittest.mock import patch

import pytest

from playbooks.managers import playbook_manager
from playbooks.schemas import PlaybookUpsertRequest, TargetSelection


@pytest.fixture
def with_repo_mock(mock_session, repo_path):
    """Patch repos_manager in playbooks and hosts (resolve_targets uses host_manager)."""
    with patch("playbooks.managers.repos_manager") as m, patch(
        "hosts.managers.repos_manager"
    ) as m2:
        m.active_repo_path.return_value = repo_path
        m2.active_repo_path.return_value = repo_path
        yield mock_session


class TestPlaybookManagerListPlaybooks:
    def test_empty_when_no_repo(self, mock_session):
        with patch("playbooks.managers.repos_manager") as m:
            from github.misc import RepoNotAvailableError
            m.active_repo_path.side_effect = RepoNotAvailableError("no repo")
            result = playbook_manager.list_playbooks(mock_session)
        assert result == []

    def test_empty_returns_empty(self, with_repo_mock):
        result = playbook_manager.list_playbooks(with_repo_mock)
        assert result == []

    def test_lists_playbooks(self, with_repo_mock, layout):
        layout.playbooks_path.mkdir(parents=True, exist_ok=True)
        (layout.playbooks_path / "s_abc.yml").write_text("""
- name: Test play
  hosts: all
  vars:
    racksmith_description: My Playbook
  roles: []
""")
        result = playbook_manager.list_playbooks(with_repo_mock)
        assert len(result) >= 1
        pb = next(p for p in result if p.id == "s_abc")
        assert pb.name == "Test play"
        assert pb.description == "My Playbook"


class TestPlaybookManagerGetPlaybook:
    def test_get_playbook_found(self, with_repo_mock, layout):
        layout.playbooks_path.mkdir(parents=True, exist_ok=True)
        (layout.playbooks_path / "s_abc.yml").write_text("""
- name: Test
  hosts: all
  vars:
    racksmith_description: Desc
  roles: []
""")
        detail = playbook_manager.get_playbook(with_repo_mock, "s_abc")
        assert detail.id == "s_abc"
        assert detail.name == "Test"
        assert detail.description == "Desc"

    def test_get_playbook_not_found_raises(self, with_repo_mock):
        with pytest.raises(FileNotFoundError, match="not found"):
            playbook_manager.get_playbook(with_repo_mock, "nonexistent")


class TestPlaybookManagerCreatePlaybook:
    def test_create_playbook_requires_role(self, with_repo_mock, layout):
        layout.roles_path.mkdir(parents=True, exist_ok=True)
        (layout.roles_path / "my_role").mkdir()
        (layout.roles_path / "my_role" / "meta").mkdir()
        (layout.roles_path / "my_role" / "meta" / "main.yml").write_text("""
galaxy_info:
  role_name: my_role
""")
        body = PlaybookUpsertRequest(
            name="New Playbook",
            description="Desc",
            roles=[{"role_slug": "my_role", "vars": {}}],
        )
        detail = playbook_manager.create_playbook(with_repo_mock, body)
        assert detail.name == "New Playbook"
        assert "my_role" in detail.roles

    def test_create_playbook_unknown_role_raises(self, with_repo_mock):
        body = PlaybookUpsertRequest(
            name="New",
            description="",
            roles=[{"role_slug": "nonexistent_role", "vars": {}}],
        )
        with pytest.raises(ValueError, match="Unknown role"):
            playbook_manager.create_playbook(with_repo_mock, body)


class TestPlaybookManagerUpdatePlaybook:
    def test_update_playbook(self, with_repo_mock, layout):
        layout.playbooks_path.mkdir(parents=True, exist_ok=True)
        (layout.playbooks_path / "s_abc.yml").write_text("""
- name: Old
  hosts: all
  vars:
    racksmith_description: Old desc
  roles: []
""")
        layout.roles_path.mkdir(parents=True, exist_ok=True)
        (layout.roles_path / "my_role").mkdir()
        (layout.roles_path / "my_role" / "meta").mkdir()
        (layout.roles_path / "my_role" / "meta" / "main.yml").write_text("""
galaxy_info:
  role_name: my_role
""")
        body = PlaybookUpsertRequest(
            name="Updated Name",
            description="Updated desc",
            roles=[{"role_slug": "my_role", "vars": {}}],
        )
        detail = playbook_manager.update_playbook(with_repo_mock, "s_abc", body)
        assert detail.name == "Updated Name"
        assert detail.description == "Updated desc"


class TestPlaybookManagerDeletePlaybook:
    def test_delete_playbook(self, with_repo_mock, layout):
        layout.playbooks_path.mkdir(parents=True, exist_ok=True)
        (layout.playbooks_path / "s_abc.yml").write_text("""
- name: To Delete
  hosts: all
  roles: []
""")
        playbook_manager.delete_playbook(with_repo_mock, "s_abc")
        with pytest.raises(FileNotFoundError, match="not found"):
            playbook_manager.get_playbook(with_repo_mock, "s_abc")


class TestPlaybookManagerResolveTargets:
    def test_resolve_targets_empty_when_no_hosts(self, with_repo_mock):
        result = playbook_manager.resolve_targets(
            with_repo_mock, TargetSelection()
        )
        assert result.hosts == []

    def test_resolve_targets_by_groups(self, with_repo_mock, layout):
        layout.inventory_path.mkdir(parents=True, exist_ok=True)
        (layout.inventory_path / "hosts.yml").write_text("""
all:
  hosts:
    web1:
      ansible_host: 10.0.0.1
      ansible_user: deploy
  children:
    web:
      hosts:
        web1: {}
""")
        layout.host_vars_path.mkdir(parents=True, exist_ok=True)
        (layout.host_vars_path / "web1.yml").write_text("racksmith_name: Web1\n")
        result = playbook_manager.resolve_targets(
            with_repo_mock,
            TargetSelection(groups=["web"]),
        )
        assert "web1" in result.hosts

    def test_resolve_targets_by_hosts(self, with_repo_mock, layout):
        layout.inventory_path.mkdir(parents=True, exist_ok=True)
        (layout.inventory_path / "hosts.yml").write_text("""
all:
  hosts:
    web1:
      ansible_host: 10.0.0.1
      ansible_user: deploy
""")
        layout.host_vars_path.mkdir(parents=True, exist_ok=True)
        (layout.host_vars_path / "web1.yml").write_text("racksmith_name: Web1\n")
        result = playbook_manager.resolve_targets(
            with_repo_mock,
            TargetSelection(hosts=["web1"]),
        )
        assert "web1" in result.hosts
