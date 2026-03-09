"""Unit tests for ansible.config."""

from pathlib import Path

import yaml

from ansible import resolve_layout


class TestResolveLayoutDefaults:
    """When no config files exist, use default paths."""

    def test_empty_repo_uses_defaults(self, repo_path: Path) -> None:
        layout = resolve_layout(repo_path)
        assert layout.repo_path.resolve() == repo_path.resolve()
        assert layout.inventory_path == repo_path / "inventory"
        assert layout.host_vars_path == repo_path / "host_vars"
        assert layout.group_vars_path == repo_path / "group_vars"
        assert layout.roles_path == repo_path / "roles"
        assert layout.playbooks_path == repo_path / "playbooks"
        assert layout.racks_file == repo_path / ".racksmith" / "racks.yml"

    def test_host_vars_file_helper(self, repo_path: Path) -> None:
        layout = resolve_layout(repo_path)
        assert layout.host_vars_file("web1") == repo_path / "host_vars" / "web1.yml"

    def test_group_vars_file_helper(self, repo_path: Path) -> None:
        layout = resolve_layout(repo_path)
        assert layout.group_vars_file("prod") == repo_path / "group_vars" / "prod.yml"


class TestResolveLayoutAnsibleCfg:
    """ansible.cfg [defaults] section overrides."""

    def test_inventory_from_ansible_cfg(self, repo_path: Path) -> None:
        (repo_path / "ansible.cfg").write_text(
            "[defaults]\ninventory = my_inv/hosts.yml\n"
        )
        layout = resolve_layout(repo_path)
        assert layout.inventory_path == repo_path / "my_inv"

    def test_inventory_file_in_root(self, repo_path: Path) -> None:
        (repo_path / "ansible.cfg").write_text("[defaults]\ninventory = hosts\n")
        (repo_path / "hosts").write_text("# empty")
        layout = resolve_layout(repo_path)
        assert layout.inventory_path == repo_path

    def test_roles_path_from_ansible_cfg(self, repo_path: Path) -> None:
        (repo_path / "ansible.cfg").write_text("[defaults]\nroles_path = /abs/roles\n")
        layout = resolve_layout(repo_path)
        assert layout.roles_path == Path("/abs/roles")

    def test_roles_path_colon_separated_takes_first(self, repo_path: Path) -> None:
        (repo_path / "ansible.cfg").write_text(
            "[defaults]\nroles_path = roles1:roles2:roles3\n"
        )
        layout = resolve_layout(repo_path)
        assert layout.roles_path == repo_path / "roles1"

    def test_ignores_other_sections(self, repo_path: Path) -> None:
        (repo_path / "ansible.cfg").write_text(
            "[defaults]\ninventory = custom_inv\n\n[ssh_connection]\nfoo = bar\n"
        )
        layout = resolve_layout(repo_path)
        assert layout.inventory_path == repo_path / "custom_inv"


class TestResolveLayoutRacksmithConfig:
    """`.racksmith/config.yml` takes precedence over ansible.cfg."""

    def test_overrides_ansible_cfg(self, repo_path: Path) -> None:
        (repo_path / "ansible.cfg").write_text("[defaults]\ninventory = ansible_inv\n")
        (repo_path / ".racksmith").mkdir()
        (repo_path / ".racksmith" / "config.yml").write_text(
            yaml.safe_dump({"inventory_path": "racksmith_inv"})
        )
        layout = resolve_layout(repo_path)
        assert layout.inventory_path == repo_path / "racksmith_inv"

    def test_all_paths_overridable(self, repo_path: Path) -> None:
        (repo_path / ".racksmith").mkdir()
        (repo_path / ".racksmith" / "config.yml").write_text(
            yaml.safe_dump(
                {
                    "inventory_path": "inv",
                    "host_vars_path": "hv",
                    "group_vars_path": "gv",
                    "roles_path": "r",
                    "playbooks_path": "pb",
                }
            )
        )
        layout = resolve_layout(repo_path)
        assert layout.inventory_path == repo_path / "inv"
        assert layout.host_vars_path == repo_path / "hv"
        assert layout.group_vars_path == repo_path / "gv"
        assert layout.roles_path == repo_path / "r"
        assert layout.playbooks_path == repo_path / "pb"

    def test_invalid_yaml_ignored(self, repo_path: Path) -> None:
        (repo_path / ".racksmith").mkdir()
        (repo_path / ".racksmith" / "config.yml").write_text("not valid: yaml: [")
        layout = resolve_layout(repo_path)
        assert layout.inventory_path == repo_path / "inventory"


class TestResolveLayoutRacksFile:
    """racks_file is always .racksmith/racks.yml regardless of other config."""

    def test_racks_file_always_racksmith(self, repo_path: Path) -> None:
        (repo_path / ".racksmith").mkdir()
        (repo_path / ".racksmith" / "config.yml").write_text(
            yaml.safe_dump({"inventory_path": "foo"})
        )
        layout = resolve_layout(repo_path)
        assert layout.racks_file == repo_path / ".racksmith" / "racks.yml"
