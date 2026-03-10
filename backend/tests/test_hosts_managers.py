"""Unit tests for hosts/managers."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from hosts.managers import host_manager
from hosts.schemas import HostCreate, HostUpdate


@pytest.fixture
def with_repo_mock(mock_session, repo_path):
    """Patch repos_manager.active_repo_path to return repo_path."""
    with patch("hosts.managers.repos_manager") as m:
        m.active_repo_path.return_value = repo_path
        yield mock_session


class TestHostManagerListHosts:
    def test_empty_when_no_repo(self, mock_session):
        with patch("hosts.managers.repos_manager") as m:
            from github.misc import RepoNotAvailableError
            m.active_repo_path.side_effect = RepoNotAvailableError("no repo")
            result = host_manager.list_hosts(mock_session)
        assert result == []

    def test_empty_inventory_returns_empty(self, with_repo_mock, repo_path):
        result = host_manager.list_hosts(with_repo_mock)
        assert result == []

    def test_lists_hosts_from_inventory(self, with_repo_mock, layout):
        layout.inventory_path.mkdir(parents=True, exist_ok=True)
        (layout.inventory_path / "hosts.yml").write_text("""
all:
  hosts:
    web1:
      ansible_host: 192.168.1.10
      ansible_user: deploy
""")
        layout.host_vars_path.mkdir(parents=True, exist_ok=True)
        (layout.host_vars_path / "web1.yml").write_text("racksmith_name: Web Server 1\n")
        result = host_manager.list_hosts(with_repo_mock)
        assert len(result) >= 1
        host = next(h for h in result if h.id == "web1")
        assert host.ip_address == "192.168.1.10"
        assert host.name == "Web Server 1"


class TestHostManagerCreateHost:
    @pytest.mark.asyncio
    async def test_create_unmanaged_device(self, with_repo_mock):
        data = HostCreate(name="My Switch", managed=False)
        host = await host_manager.create_host(with_repo_mock, data)
        assert host.id.startswith("d_")
        assert host.name == "My Switch"
        assert host.managed is False

    @pytest.mark.asyncio
    async def test_create_managed_host_without_probe(self, with_repo_mock):
        with patch("hosts.managers.probe_ssh_target", new_callable=AsyncMock) as probe:
            probe.side_effect = Exception("skip probe")
            data = HostCreate(
                name="Web1",
                ip_address="192.168.1.10",
                ssh_user="deploy",
                managed=True,
            )
            host = await host_manager.create_host(with_repo_mock, data)
        assert host.name == "Web1"
        assert host.ip_address == "192.168.1.10"
        assert host.managed is True


class TestHostManagerGetHost:
    def test_get_host_found(self, with_repo_mock, layout):
        layout.inventory_path.mkdir(parents=True, exist_ok=True)
        (layout.inventory_path / "hosts.yml").write_text("""
all:
  hosts:
    web1:
      ansible_host: 10.0.0.1
""")
        layout.host_vars_path.mkdir(parents=True, exist_ok=True)
        (layout.host_vars_path / "web1.yml").write_text("racksmith_name: Web\n")
        host = host_manager.get_host(with_repo_mock, "web1")
        assert host.id == "web1"
        assert host.ip_address == "10.0.0.1"

    def test_get_host_not_found_raises(self, with_repo_mock):
        with pytest.raises(KeyError, match="not found"):
            host_manager.get_host(with_repo_mock, "nonexistent")


class TestHostManagerUpdateHost:
    def test_update_host(self, with_repo_mock, layout):
        layout.inventory_path.mkdir(parents=True, exist_ok=True)
        (layout.inventory_path / "hosts.yml").write_text("""
all:
  hosts:
    web1:
      ansible_host: 10.0.0.1
      ansible_user: deploy
""")
        layout.host_vars_path.mkdir(parents=True, exist_ok=True)
        (layout.host_vars_path / "web1.yml").write_text("racksmith_name: Old Name\n")
        host = host_manager.update_host(
            with_repo_mock, "web1", HostUpdate(name="New Name")
        )
        assert host.name == "New Name"


class TestHostManagerDeleteHost:
    def test_delete_host(self, with_repo_mock, layout):
        layout.inventory_path.mkdir(parents=True, exist_ok=True)
        (layout.inventory_path / "hosts.yml").write_text("""
all:
  hosts:
    web1:
      ansible_host: 10.0.0.1
""")
        layout.host_vars_path.mkdir(parents=True, exist_ok=True)
        (layout.host_vars_path / "web1.yml").write_text("racksmith_name: Web\n")
        host_manager.delete_host(with_repo_mock, "web1")
        with pytest.raises(KeyError, match="not found"):
            host_manager.get_host(with_repo_mock, "web1")
