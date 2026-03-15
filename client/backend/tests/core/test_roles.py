"""Unit tests for ansible.roles."""

import yaml

from core.racksmith_meta import RacksmithMeta, write_meta
from core.roles import (
    RoleData,
    RoleInput,
    list_roles,
    read_role,
    read_role_defaults,
    read_role_tasks,
    remove_role,
    write_role,
)


class TestReadRoleMetaMain:
    """read_role from meta/main.yml (standard format)."""

    def test_returns_none_for_empty_dir(self, layout) -> None:
        role_dir = layout.roles_path / "empty_role"
        role_dir.mkdir(parents=True, exist_ok=True)
        assert read_role(role_dir) is None

    def test_parses_meta_main_yml(self, layout) -> None:
        role_dir = layout.roles_path / "nginx"
        role_dir.mkdir(parents=True, exist_ok=True)
        (role_dir / "meta").mkdir()
        (role_dir / "meta" / "main.yml").write_text(
            yaml.safe_dump(
                {
                    "galaxy_info": {
                        "role_name": "Nginx",
                        "description": "Install Nginx",
                        "platforms": [{"name": "Ubuntu"}],
                        "galaxy_tags": ["web", "proxy"],
                    },
                    "argument_specs": {
                        "main": {
                            "options": {
                                "port": {
                                    "type": "int",
                                    "default": 80,
                                    "description": "Port",
                                },
                                "enabled": {"type": "bool", "default": True},
                            }
                        }
                    },
                }
            )
        )
        role = read_role(role_dir)
        assert role is not None
        assert role.id == "nginx"
        assert role.name == "Nginx"
        assert role.description == "Install Nginx"
        assert len(role.platforms) == 1
        assert role.tags == ["web", "proxy"]
        assert len(role.inputs) == 2
        by_key = {i.key: i for i in role.inputs}
        assert by_key["port"].type == "int"
        assert by_key["port"].default == 80
        assert by_key["enabled"].type == "bool"

    def test_racksmith_input_hints_from_meta(self, layout) -> None:
        """Racksmith input hints (placeholder, interactive) come from .racksmith.yml overlay."""
        role_dir = layout.roles_path / "foo"
        role_dir.mkdir(parents=True, exist_ok=True)
        (role_dir / "meta").mkdir()
        (role_dir / "meta" / "main.yml").write_text(
            yaml.safe_dump(
                {
                    "galaxy_info": {"role_name": "Foo"},
                    "argument_specs": {
                        "main": {
                            "options": {
                                "x": {"type": "str"},
                            }
                        }
                    },
                }
            )
        )
        meta = RacksmithMeta()
        meta.roles["foo"] = {
            "inputs": {
                "x": {
                    "placeholder": "hint",
                    "interactive": True,
                },
            },
        }
        write_meta(layout, meta)
        roles = list_roles(layout)
        assert len(roles) == 1
        inp = roles[0].inputs[0]
        assert inp.racksmith_placeholder == "hint"
        assert inp.racksmith_interactive is True


class TestReadRoleActionYaml:
    """read_role falls back to action.yaml (legacy format)."""

    def test_parses_action_yaml(self, layout) -> None:
        role_dir = layout.roles_path / "install-packages"
        role_dir.mkdir(parents=True, exist_ok=True)
        (role_dir / "action.yaml").write_text(
            yaml.safe_dump(
                {
                    "slug": "install-packages",
                    "name": "Install Packages",
                    "description": "Install system packages",
                    "labels": ["packages", "system"],
                    "compatibility": {"os_family": ["debian", "rhel"]},
                    "inputs": [
                        {
                            "key": "pkg",
                            "label": "Package",
                            "type": "string",
                            "required": True,
                        },
                        {
                            "key": "state",
                            "type": "string",
                            "options": ["present", "absent"],
                        },
                        {"key": "secret", "type": "secret"},
                    ],
                }
            )
        )
        role = read_role(role_dir)
        assert role is not None
        assert role.id == "install-packages"
        assert role.name == "Install Packages"
        assert role.tags == ["packages", "system"]
        assert len(role.platforms) == 2
        assert len(role.inputs) == 3
        by_key = {i.key: i for i in role.inputs}
        assert by_key["pkg"].type == "str"
        assert by_key["pkg"].description == "Package"
        assert by_key["state"].choices == ["present", "absent"]
        assert by_key["secret"].no_log is True

    def test_meta_main_takes_precedence_over_action_yaml(self, layout) -> None:
        role_dir = layout.roles_path / "both"
        role_dir.mkdir(parents=True, exist_ok=True)
        (role_dir / "meta").mkdir()
        (role_dir / "meta" / "main.yml").write_text(
            yaml.safe_dump(
                {
                    "galaxy_info": {"role_name": "From Meta"},
                    "argument_specs": {"main": {"options": {}}},
                }
            )
        )
        (role_dir / "action.yaml").write_text(
            yaml.safe_dump(
                {
                    "slug": "both",
                    "name": "From Action",
                }
            )
        )
        role = read_role(role_dir)
        assert role is not None
        assert role.name == "From Meta"


class TestReadRoleTasksAndDefaults:
    """read_role_tasks, read_role_defaults."""

    def test_read_role_tasks(self, layout) -> None:
        role_dir = layout.roles_path / "r1"
        role_dir.mkdir(parents=True, exist_ok=True)
        (role_dir / "tasks").mkdir()
        (role_dir / "tasks" / "main.yml").write_text("- debug: msg=hello\n")
        content = read_role_tasks(role_dir)
        assert "debug" in content

    def test_read_role_tasks_empty_when_missing(self, layout) -> None:
        role_dir = layout.roles_path / "r2"
        role_dir.mkdir(parents=True, exist_ok=True)
        assert read_role_tasks(role_dir) == ""

    def test_read_role_defaults(self, layout) -> None:
        role_dir = layout.roles_path / "r3"
        role_dir.mkdir(parents=True, exist_ok=True)
        (role_dir / "defaults").mkdir()
        (role_dir / "defaults" / "main.yml").write_text(
            yaml.safe_dump({"port": 80, "enabled": True})
        )
        defaults = read_role_defaults(role_dir)
        assert defaults["port"] == 80
        assert defaults["enabled"] is True

    def test_read_role_defaults_empty_when_missing(self, layout) -> None:
        role_dir = layout.roles_path / "r4"
        role_dir.mkdir(parents=True, exist_ok=True)
        assert read_role_defaults(role_dir) == {}


class TestListRoles:
    """list_roles(layout)."""

    def test_empty_when_no_roles_dir(self, layout) -> None:
        assert list_roles(layout) == []

    def test_returns_parsable_roles(self, layout) -> None:
        for name in ["a", "b", "c"]:
            role_dir = layout.roles_path / name
            role_dir.mkdir(parents=True, exist_ok=True)
            (role_dir / "action.yaml").write_text(
                yaml.safe_dump({"name": name.upper()})
            )
        roles = list_roles(layout)
        assert len(roles) == 3
        assert {r.id for r in roles} == {"a", "b", "c"}

    def test_skips_dirs_without_manifest(self, layout) -> None:
        layout.roles_path.mkdir(parents=True, exist_ok=True)
        (layout.roles_path / "valid").mkdir()
        (layout.roles_path / "valid" / "action.yaml").write_text(
            yaml.safe_dump({"name": "Valid"})
        )
        (layout.roles_path / "invalid").mkdir()
        roles = list_roles(layout)
        assert len(roles) == 1
        assert roles[0].id == "valid"


class TestWriteRole:
    """write_role(layout, role, tasks_yaml)."""

    def test_creates_meta_main_and_tasks(self, layout) -> None:
        role = RoleData(
            name="Deploy",
            description="Deploy app",
            platforms=[],
            tags=["deploy"],
            inputs=[
                RoleInput(key="port", type="int", default=8080),
                RoleInput(
                    key="env",
                    description="Environment",
                    choices=["staging", "prod"],
                ),
            ],
            id="deploy",
        )
        path = write_role(layout, role, tasks_yaml="- debug: msg=hi\n")
        assert path == layout.roles_path / "deploy"
        assert (path / "meta" / "main.yml").exists()
        assert (path / "tasks" / "main.yml").exists()
        assert "debug" in (path / "tasks" / "main.yml").read_text()
        # meta/main.yml should NOT contain x_racksmith keys
        meta_content = (path / "meta" / "main.yml").read_text()
        assert "x_racksmith" not in meta_content

    def test_roundtrip_via_list_roles(self, layout) -> None:
        """Roundtrip: write_role -> list_roles (which overlays racksmith meta)."""
        original = RoleData(
            name="Roundtrip Role",
            description="Test",
            platforms=[{"name": "Ubuntu"}],
            tags=["t1", "t2"],
            inputs=[
                RoleInput(key="x", type="str", description="X Label", default="a"),
            ],
            has_tasks=False,
            id="roundtrip",
        )
        write_role(layout, original, tasks_yaml="- name: task\n  debug: {}\n")
        roles = list_roles(layout)
        assert len(roles) == 1
        read_back = roles[0]
        assert read_back.id == original.id
        assert read_back.name == original.name
        assert read_back.description == original.description
        assert len(read_back.inputs) == 1
        assert read_back.inputs[0].description == "X Label"
        assert read_back.has_tasks is True

    def test_uses_id_for_directory_name(self, layout) -> None:
        """write_role uses role.id for the directory name."""
        role = RoleData(
            name="My Role",
            id="role_abc123",
        )
        path = write_role(layout, role)
        assert path == layout.roles_path / "role_abc123"
        assert path.is_dir()


class TestRemoveRole:
    """remove_role(layout, slug)."""

    def test_deletes_role_dir(self, layout) -> None:
        role_dir = layout.roles_path / "to_remove"
        role_dir.mkdir(parents=True, exist_ok=True)
        (role_dir / "action.yaml").write_text("slug: to_remove\n")
        assert role_dir.exists()
        remove_role(layout, "to_remove")
        assert not role_dir.exists()
