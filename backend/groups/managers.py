"""Group business logic backed by the active local repo."""

from __future__ import annotations

from pathlib import Path

import yaml

from groups.schemas import Group, GroupInput, GroupWithMembers
from nodes.managers import node_manager
from nodes.schemas import NodeSummary
from repos.managers import repos_manager

GROUPS_DIR = Path(".racksmith/groups")
GROUP_FILE_EXTENSIONS = (".yml", ".yaml")


class GroupManager:
    """All group operations for the active local repo."""

    def _groups_dir(self, repo_path: Path) -> Path:
        return repo_path / GROUPS_DIR

    def _group_file(self, repo_path: Path, slug: str) -> Path:
        return self._groups_dir(repo_path) / f"{slug}.yaml"

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
                slug = path.stem
                groups.append(
                    Group(
                        slug=slug,
                        name=data.get("name", ""),
                        description=data.get("description", ""),
                    )
                )
            except (OSError, yaml.YAMLError):
                continue
        return sorted(groups, key=lambda g: (g.name.lower(), g.slug))

    def get_group(self, session, slug: str) -> GroupWithMembers:
        repo_path = repos_manager.active_repo_path(session)
        path = self._group_file(repo_path, slug)
        if not path.is_file():
            raise KeyError(f"Group {slug} not found")
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
        group = Group(
            slug=slug,
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
            if slug in n.groups
        ]
        return GroupWithMembers(**group.model_dump(), nodes=members)

    def create_group(self, session, data: GroupInput) -> Group:
        repo_path = repos_manager.active_repo_path(session)
        slug = self._slugify(data.name)
        slug = self._next_slug(repo_path, slug)
        group = Group(slug=slug, name=data.name.strip(), description=data.description.strip())
        groups_dir = self._groups_dir(repo_path)
        groups_dir.mkdir(parents=True, exist_ok=True)
        self._group_file(repo_path, slug).write_text(
            yaml.safe_dump(
                {"slug": slug, "name": group.name, "description": group.description},
                sort_keys=False,
            ),
            encoding="utf-8",
        )
        return group

    def update_group(self, session, slug: str, data: GroupInput) -> Group:
        repo_path = repos_manager.active_repo_path(session)
        if not self._group_file(repo_path, slug).is_file():
            raise KeyError(f"Group {slug} not found")
        group = Group(slug=slug, name=data.name.strip(), description=data.description.strip())
        self._group_file(repo_path, slug).write_text(
            yaml.safe_dump(
                {"slug": slug, "name": group.name, "description": group.description},
                sort_keys=False,
            ),
            encoding="utf-8",
        )
        return group

    def delete_group(self, session, slug: str) -> None:
        repo_path = repos_manager.active_repo_path(session)
        path = self._group_file(repo_path, slug)
        if not path.is_file():
            raise KeyError(f"Group {slug} not found")
        path.unlink(missing_ok=True)

    def _slugify(self, name: str) -> str:
        import re

        slug = re.sub(r"[^a-z0-9]+", "-", name.strip().lower()).strip("-")
        return slug or "group"

    def _next_slug(self, repo_path: Path, base: str) -> str:
        candidate = base
        suffix = 2
        while self._group_file(repo_path, candidate).exists():
            candidate = f"{base}-{suffix}"
            suffix += 1
        return candidate


group_manager = GroupManager()
