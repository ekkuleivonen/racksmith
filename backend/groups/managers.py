"""Group business logic backed by the active local repo."""

from __future__ import annotations

import secrets
from pathlib import Path

import yaml

from groups.schemas import Group, GroupInput, GroupWithMembers
from nodes.managers import node_manager
from nodes.schemas import NodeSummary
from repos.managers import repos_manager

GROUPS_DIR = Path(".racksmith/groups")
GROUP_FILE_EXTENSIONS = (".yml", ".yaml")


def _generate_group_id(repo_path: Path) -> str:
    for _ in range(100):
        candidate = f"g-{secrets.token_hex(3)}"
        if not (repo_path / GROUPS_DIR / f"{candidate}.yaml").exists():
            return candidate
    raise RuntimeError("Failed to generate unique group ID")


class GroupManager:
    """All group operations for the active local repo."""

    def _groups_dir(self, repo_path: Path) -> Path:
        return repo_path / GROUPS_DIR

    def _group_file(self, repo_path: Path, group_id: str) -> Path:
        return self._groups_dir(repo_path) / f"{group_id}.yaml"

    def _iter_group_files(self, repo_path: Path) -> list[Path]:
        groups_dir = self._groups_dir(repo_path)
        if not groups_dir.is_dir():
            return []
        files: list[Path] = []
        for ext in GROUP_FILE_EXTENSIONS:
            files.extend(sorted(groups_dir.glob(f"*{ext}")))
        return files

    def list_groups(self, session) -> list[Group]:
        try:
            repo_path = repos_manager.active_repo_path(session)
        except FileNotFoundError:
            return []
        groups: list[Group] = []
        for path in self._iter_group_files(repo_path):
            try:
                data = yaml.safe_load(path.read_text(encoding="utf-8"))
                group_id = data.get("id") or path.stem
                groups.append(
                    Group(
                        id=group_id,
                        name=data.get("name", ""),
                        description=data.get("description", ""),
                    )
                )
            except (OSError, yaml.YAMLError):
                continue
        return sorted(groups, key=lambda g: (g.name.lower(), g.id))

    def get_group(self, session, group_id: str) -> GroupWithMembers:
        repo_path = repos_manager.active_repo_path(session)
        path = self._group_file(repo_path, group_id)
        if not path.is_file():
            raise KeyError(f"Group {group_id} not found")
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
        gid = data.get("id") or path.stem
        group = Group(
            id=gid,
            name=data.get("name", ""),
            description=data.get("description", ""),
        )
        all_nodes = node_manager.list_nodes(session)
        members = [
            NodeSummary(
                id=n.id,
                name=n.name,
                hostname=n.hostname,
                ip_address=n.ip_address,
                managed=n.managed,
                groups=n.groups,
                labels=n.labels,
            )
            for n in all_nodes
            if group_id in n.groups
        ]
        return GroupWithMembers(**group.model_dump(), nodes=members)

    def create_group(self, session, data: GroupInput) -> Group:
        repo_path = repos_manager.active_repo_path(session)
        group_id = _generate_group_id(repo_path)
        group = Group(
            id=group_id,
            name=data.name.strip(),
            description=data.description.strip(),
        )
        groups_dir = self._groups_dir(repo_path)
        groups_dir.mkdir(parents=True, exist_ok=True)
        self._group_file(repo_path, group_id).write_text(
            yaml.safe_dump(
                {"id": group_id, "name": group.name, "description": group.description},
                sort_keys=False,
            ),
            encoding="utf-8",
        )
        return group

    def update_group(self, session, group_id: str, data: GroupInput) -> Group:
        repo_path = repos_manager.active_repo_path(session)
        if not self._group_file(repo_path, group_id).is_file():
            raise KeyError(f"Group {group_id} not found")
        group = Group(
            id=group_id,
            name=data.name.strip(),
            description=data.description.strip(),
        )
        self._group_file(repo_path, group_id).write_text(
            yaml.safe_dump(
                {"id": group_id, "name": group.name, "description": group.description},
                sort_keys=False,
            ),
            encoding="utf-8",
        )
        return group

    def delete_group(self, session, group_id: str) -> None:
        repo_path = repos_manager.active_repo_path(session)
        path = self._group_file(repo_path, group_id)
        if not path.is_file():
            raise KeyError(f"Group {group_id} not found")
        path.unlink(missing_ok=True)


group_manager = GroupManager()
