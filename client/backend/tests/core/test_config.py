"""Unit tests for ansible.config."""

from pathlib import Path

import yaml

from core import resolve_layout


class TestResolveLayoutDefaults:
    """When no config exists, use .racksmith/ as base with fixed subdirs."""

    def test_empty_repo_uses_defaults(self, repo_path: Path) -> None:
        layout = resolve_layout(repo_path)
        base = repo_path / ".racksmith"
        assert layout.repo_path.resolve() == repo_path.resolve()
        assert layout.racksmith_base == base
        assert layout.racksmith_prefix == ".racksmith"
        assert layout.inventory_path == base / "inventory"
        assert layout.host_vars_path == base / "inventory" / "host_vars"
        assert layout.group_vars_path == base / "inventory" / "group_vars"
        assert layout.roles_path == base / "roles"
        assert layout.playbooks_path == base / "playbooks"

    def test_host_vars_file_helper(self, repo_path: Path) -> None:
        layout = resolve_layout(repo_path)
        assert layout.host_vars_file("web1") == repo_path / ".racksmith" / "inventory" / "host_vars" / "web1.yml"

    def test_group_vars_file_helper(self, repo_path: Path) -> None:
        layout = resolve_layout(repo_path)
        assert layout.group_vars_file("prod") == repo_path / ".racksmith" / "inventory" / "group_vars" / "prod.yml"


class TestResolveLayoutRacksmithConfig:
    """`.racksmith/config.yml` racksmith_dir controls base path."""

    def test_custom_racksmith_dir(self, repo_path: Path) -> None:
        (repo_path / ".racksmith").mkdir()
        (repo_path / ".racksmith" / "config.yml").write_text(
            yaml.safe_dump({"racksmith_dir": "ansible_resources"})
        )
        layout = resolve_layout(repo_path)
        base = repo_path / "ansible_resources"
        assert layout.racksmith_base == base
        assert layout.racksmith_prefix == "ansible_resources"
        assert layout.inventory_path == base / "inventory"
        assert layout.host_vars_path == base / "inventory" / "host_vars"
        assert layout.roles_path == base / "roles"
        assert layout.playbooks_path == base / "playbooks"

    def test_invalid_yaml_ignored(self, repo_path: Path) -> None:
        (repo_path / ".racksmith").mkdir()
        (repo_path / ".racksmith" / "config.yml").write_text("not valid: yaml: [")
        layout = resolve_layout(repo_path)
        assert layout.inventory_path == repo_path / ".racksmith" / "inventory"
