"""Unit tests for hosts/managers."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest
import yaml

from _utils.exceptions import NotFoundError
from hosts.managers import host_manager
from hosts.schemas import HostCreate, HostUpdate


def _set_host_racksmith(layout, host_id: str, data: dict) -> None:
    """Write racksmith metadata for a host.

    Targetable keys go to host_vars with racksmith_ prefix.
    Meta-only keys go to .racksmith.yml hosts section.
    """
    from core.extensions import HOST_META_ONLY_KEYS

    targetable = {k: v for k, v in data.items() if k not in HOST_META_ONLY_KEYS}
    meta_only = {k: v for k, v in data.items() if k in HOST_META_ONLY_KEYS}

    if targetable:
        path = layout.host_vars_file(host_id)
        path.parent.mkdir(parents=True, exist_ok=True)
        existing: dict = {}
        if path.is_file():
            existing = yaml.safe_load(path.read_text()) or {}
        for k, v in targetable.items():
            existing[f"racksmith_{k}"] = v
        path.write_text(yaml.safe_dump(existing, sort_keys=False))

    if meta_only:
        meta_path = layout.racksmith_base / ".racksmith.yml"
        meta_path.parent.mkdir(parents=True, exist_ok=True)
        meta_data: dict = {}
        if meta_path.is_file():
            meta_data = yaml.safe_load(meta_path.read_text()) or {}
        host_entry: dict = meta_data.setdefault("hosts", {}).setdefault(host_id, {})
        host_entry.update(meta_only)
        meta_path.write_text(yaml.safe_dump(meta_data, sort_keys=False))


@pytest.fixture
def with_repo_mock(with_hosts_repo_mock):
    return with_hosts_repo_mock


class TestHostManagerListHosts:
    def test_empty_when_no_repo(self, mock_session):
        with patch("_utils.repo_helpers.repos_manager") as m:
            from _utils.exceptions import RepoNotAvailableError
            m.active_repo_path.side_effect = RepoNotAvailableError("no repo")
            result = host_manager.list_hosts(mock_session)
        assert result == []

    def test_empty_inventory_returns_empty(self, with_repo_mock):
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
        _set_host_racksmith(layout, "web1", {"name": "Web Server 1"})
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
        assert host.id.startswith("racknode_")
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
        _set_host_racksmith(layout, "web1", {"name": "Web"})
        host = host_manager.get_host(with_repo_mock, "web1")
        assert host.id == "web1"
        assert host.ip_address == "10.0.0.1"

    def test_get_host_not_found_raises(self, with_repo_mock):
        with pytest.raises(NotFoundError, match="not found"):
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
        _set_host_racksmith(layout, "web1", {"name": "Old Name"})
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
        _set_host_racksmith(layout, "web1", {"name": "Web"})
        host_manager.delete_host(with_repo_mock, "web1")
        with pytest.raises(NotFoundError, match="not found"):
            host_manager.get_host(with_repo_mock, "web1")


class TestHostVars:
    @pytest.mark.asyncio
    async def test_create_host_with_vars(self, with_repo_mock):
        with patch("hosts.managers.probe_ssh_target", new_callable=AsyncMock) as probe:
            probe.side_effect = Exception("skip probe")
            data = HostCreate(
                name="Web1",
                ip_address="192.168.1.10",
                ssh_user="deploy",
                managed=True,
                vars={"http_port": 8080, "debug": True},
            )
            host = await host_manager.create_host(with_repo_mock, data)
        assert host.vars == {"http_port": 8080, "debug": True}
        fetched = host_manager.get_host(with_repo_mock, host.id)
        assert fetched.vars["http_port"] == 8080
        assert fetched.vars["debug"] is True

    def test_update_host_vars(self, with_repo_mock, layout):
        layout.inventory_path.mkdir(parents=True, exist_ok=True)
        (layout.inventory_path / "hosts.yml").write_text("""
all:
  hosts:
    web1:
      ansible_host: 10.0.0.1
      ansible_user: deploy
""")
        _set_host_racksmith(layout, "web1", {"name": "Web"})
        hv = layout.host_vars_file("web1")
        hv.parent.mkdir(parents=True, exist_ok=True)
        existing = yaml.safe_load(hv.read_text()) if hv.is_file() else {}
        existing["my_var"] = "initial"
        hv.write_text(yaml.safe_dump(existing, sort_keys=False))

        host = host_manager.get_host(with_repo_mock, "web1")
        assert host.vars["my_var"] == "initial"

        updated = host_manager.update_host(
            with_repo_mock, "web1", HostUpdate(vars={"my_var": "changed", "new_var": 42})
        )
        assert updated.vars == {"my_var": "changed", "new_var": 42}
        assert host_manager.get_host(with_repo_mock, "web1").vars["new_var"] == 42

    def test_update_vars_to_empty(self, with_repo_mock, layout):
        layout.inventory_path.mkdir(parents=True, exist_ok=True)
        (layout.inventory_path / "hosts.yml").write_text("""
all:
  hosts:
    web1:
      ansible_host: 10.0.0.1
      ansible_user: deploy
""")
        _set_host_racksmith(layout, "web1", {"name": "Web"})
        hv = layout.host_vars_file("web1")
        hv.parent.mkdir(parents=True, exist_ok=True)
        existing = yaml.safe_load(hv.read_text()) if hv.is_file() else {}
        existing["my_var"] = "initial"
        hv.write_text(yaml.safe_dump(existing, sort_keys=False))

        updated = host_manager.update_host(
            with_repo_mock, "web1", HostUpdate(vars={})
        )
        assert updated.vars == {}

    def test_update_without_vars_preserves_existing(self, with_repo_mock, layout):
        layout.inventory_path.mkdir(parents=True, exist_ok=True)
        (layout.inventory_path / "hosts.yml").write_text("""
all:
  hosts:
    web1:
      ansible_host: 10.0.0.1
      ansible_user: deploy
""")
        _set_host_racksmith(layout, "web1", {"name": "Web"})
        hv = layout.host_vars_file("web1")
        hv.parent.mkdir(parents=True, exist_ok=True)
        existing = yaml.safe_load(hv.read_text()) if hv.is_file() else {}
        existing["keep_me"] = "yes"
        hv.write_text(yaml.safe_dump(existing, sort_keys=False))

        updated = host_manager.update_host(
            with_repo_mock, "web1", HostUpdate(name="Renamed")
        )
        assert updated.name == "Renamed"
        assert updated.vars["keep_me"] == "yes"

    def test_system_vars_not_leaked_into_vars(self, with_repo_mock, layout):
        """ansible_host, ansible_user, racksmith_ keys must not appear in vars."""
        layout.inventory_path.mkdir(parents=True, exist_ok=True)
        (layout.inventory_path / "hosts.yml").write_text("""
all:
  hosts:
    web1:
      ansible_host: 10.0.0.1
      ansible_user: deploy
""")
        _set_host_racksmith(layout, "web1", {"name": "Web", "managed": True})
        host = host_manager.get_host(with_repo_mock, "web1")
        for k in host.vars:
            assert not k.startswith("ansible_")
            assert not k.startswith("racksmith_")
