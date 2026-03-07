"""Node business logic backed by the active local repo."""

from __future__ import annotations

import asyncio
import re
from datetime import UTC, datetime
from pathlib import Path

import yaml

import settings
from nodes.schemas import Node, NodeInput, NodeSummary
from repos.managers import repos_manager
from ssh.misc import probe_ssh_target

NODES_DIR = Path(".racksmith/nodes")
INVENTORY_DIR = Path(".racksmith/inventory")
NODE_FILE_EXTENSIONS = (".yml", ".yaml")


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.strip().lower()).strip("-")
    return slug or "node"


def _os_to_family(os_name: str) -> str | None:
    """Derive os_family from probe os string."""
    lower = os_name.lower()
    if "debian" in lower or "ubuntu" in lower:
        return "debian"
    if "rhel" in lower or "centos" in lower or "fedora" in lower:
        return "redhat"
    if "arch" in lower:
        return "arch"
    return None


def _node_from_yaml(slug: str, data: dict) -> Node:
    """Build Node from YAML dict (flat placement fields)."""
    placement = None
    if data.get("rack"):
        placement = {
            "rack": data["rack"],
            "u_start": data.get("position_u_start", 1),
            "u_height": data.get("position_u_height", 1),
            "col_start": data.get("position_col_start", 0),
            "col_count": data.get("position_col_count", 1),
        }
    return Node(
        slug=slug,
        name=data.get("name", ""),
        host=data.get("host", ""),
        ssh_user=data.get("ssh_user", ""),
        ssh_port=data.get("ssh_port", 22),
        managed=data.get("managed", True),
        groups=data.get("groups", []),
        tags=data.get("tags", []),
        os_family=data.get("os_family"),
        notes=data.get("notes", ""),
        placement=placement,
        mac_address=data.get("mac_address", ""),
    )


def _node_to_yaml(node: Node) -> dict:
    """Serialize Node to YAML dict (flat placement)."""
    out: dict = {
        "slug": node.slug,
        "name": node.name,
        "host": node.host,
        "ssh_user": node.ssh_user,
        "ssh_port": node.ssh_port,
        "managed": node.managed,
        "groups": node.groups,
        "tags": node.tags,
        "os_family": node.os_family,
        "mac_address": node.mac_address,
        "notes": node.notes,
    }
    if node.placement:
        out["rack"] = node.placement.rack
        out["position_u_start"] = node.placement.u_start
        out["position_u_height"] = node.placement.u_height
        out["position_col_start"] = node.placement.col_start
        out["position_col_count"] = node.placement.col_count
    return out


class NodeManager:
    """All node operations for the active local repo."""

    def _nodes_dir(self, repo_path: Path) -> Path:
        return repo_path / NODES_DIR

    def _node_file(self, repo_path: Path, slug: str) -> Path:
        return self._nodes_dir(repo_path) / f"{slug}.yaml"

    def _iter_node_files(self, repo_path: Path) -> list[Path]:
        nodes_dir = self._nodes_dir(repo_path)
        if not nodes_dir.is_dir():
            return []
        files: list[Path] = []
        for ext in NODE_FILE_EXTENSIONS:
            files.extend(sorted(nodes_dir.glob(f"*{ext}")))
        return files

    def _regenerate_inventory(self, repo_path: Path) -> None:
        """Write single hosts.yml from all nodes."""
        nodes = []
        for path in self._iter_node_files(repo_path):
            try:
                data = yaml.safe_load(path.read_text(encoding="utf-8"))
                slug = path.stem
                nodes.append(_node_from_yaml(slug, data or {}))
            except (OSError, yaml.YAMLError):
                continue

        hosts: dict[str, dict] = {}
        children: dict[str, dict] = {}

        for node in nodes:
            if not node.managed or not node.host or not node.ssh_user:
                continue
            hosts[node.slug] = {
                "ansible_host": node.host,
                "ansible_user": node.ssh_user,
                "ansible_port": node.ssh_port,
                "ansible_python_interpreter": "auto_silent",
            }
            if settings.SSH_DISABLE_HOST_KEY_CHECK:
                hosts[node.slug]["ansible_ssh_common_args"] = (
                    "-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null"
                )
            if node.os_family:
                hosts[node.slug]["os_family"] = node.os_family
            if node.tags:
                hosts[node.slug]["tags"] = node.tags

            for group in node.groups:
                if group not in children:
                    children[group] = {"hosts": {}}
                children[group]["hosts"][node.slug] = {}

        inventory = {"all": {"hosts": hosts}}
        if children:
            inventory["all"]["children"] = children

        inv_dir = repo_path / INVENTORY_DIR
        inv_dir.mkdir(parents=True, exist_ok=True)
        (inv_dir / "hosts.yml").write_text(
            yaml.safe_dump(inventory, sort_keys=False), encoding="utf-8"
        )

    def list_nodes(self, session) -> list[Node]:
        try:
            repo_path = repos_manager.active_repo_path(session)
        except FileNotFoundError:
            return []
        nodes: list[Node] = []
        for path in self._iter_node_files(repo_path):
            try:
                data = yaml.safe_load(path.read_text(encoding="utf-8"))
                slug = path.stem
                nodes.append(_node_from_yaml(slug, data or {}))
            except (OSError, yaml.YAMLError):
                continue
        return sorted(nodes, key=lambda n: (n.name.lower(), n.slug))

    def get_node(self, session, slug: str) -> Node:
        repo_path = repos_manager.active_repo_path(session)
        path = self._node_file(repo_path, slug)
        if not path.is_file():
            raise KeyError(f"Node {slug} not found")
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
        return _node_from_yaml(slug, data or {})

    def _next_slug(self, repo_path: Path, base: str) -> str:
        candidate = base
        suffix = 2
        while self._node_file(repo_path, candidate).exists():
            candidate = f"{base}-{suffix}"
            suffix += 1
        return candidate

    def create_node(self, session, data: NodeInput) -> Node:
        repo_path = repos_manager.active_repo_path(session)
        base_slug = _slugify(data.name) or "node"
        slug = self._next_slug(repo_path, base_slug)

        node = Node(
            slug=slug,
            name=data.name.strip(),
            host=data.host.strip(),
            ssh_user=data.ssh_user.strip(),
            ssh_port=data.ssh_port,
            managed=data.managed,
            groups=data.groups,
            tags=data.tags,
            os_family=data.os_family,
            notes=data.notes,
            placement=data.placement,
            mac_address="",
        )
        nodes_dir = self._nodes_dir(repo_path)
        nodes_dir.mkdir(parents=True, exist_ok=True)
        self._node_file(repo_path, slug).write_text(
            yaml.safe_dump(_node_to_yaml(node), sort_keys=False), encoding="utf-8"
        )
        self._regenerate_inventory(repo_path)
        return node

    def update_node(self, session, slug: str, data: NodeInput) -> Node:
        repo_path = repos_manager.active_repo_path(session)
        existing = self.get_node(session, slug)
        name = data.name.strip() if data.name and data.name.strip() else existing.name
        host = data.host.strip() if data.host and data.host.strip() else existing.host
        node = Node(
            slug=slug,
            name=name,
            host=host,
            ssh_user=data.ssh_user.strip(),
            ssh_port=data.ssh_port,
            managed=data.managed,
            groups=data.groups,
            tags=data.tags,
            os_family=data.os_family or existing.os_family,
            notes=data.notes,
            placement=data.placement,
            mac_address=existing.mac_address,
        )
        self._node_file(repo_path, slug).write_text(
            yaml.safe_dump(_node_to_yaml(node), sort_keys=False), encoding="utf-8"
        )
        self._regenerate_inventory(repo_path)
        return node

    def delete_node(self, session, slug: str) -> None:
        repo_path = repos_manager.active_repo_path(session)
        path = self._node_file(repo_path, slug)
        if not path.is_file():
            raise KeyError(f"Node {slug} not found")
        path.unlink(missing_ok=True)
        self._regenerate_inventory(repo_path)

    async def probe_node(self, session, slug: str) -> Node:
        node = self.get_node(session, slug)
        if not node.managed or not node.host or not node.ssh_user:
            raise ValueError("Node is not managed or missing host/ssh_user")
        probe = await probe_ssh_target(node.host, node.ssh_user, node.ssh_port)
        os_family = _os_to_family(probe.os) or node.os_family
        updated = Node(
            slug=node.slug,
            name=node.name or probe.name,
            host=probe.host,
            ssh_user=node.ssh_user,
            ssh_port=node.ssh_port,
            managed=node.managed,
            groups=node.groups,
            tags=node.tags or probe.tags,
            os_family=os_family,
            notes=node.notes,
            placement=node.placement,
            mac_address=probe.mac_address,
        )
        repo_path = repos_manager.active_repo_path(session)
        self._node_file(repo_path, slug).write_text(
            yaml.safe_dump(_node_to_yaml(updated), sort_keys=False), encoding="utf-8"
        )
        self._regenerate_inventory(repo_path)
        return updated

    async def preview_node(self, data: NodeInput) -> Node:
        """Probe without saving. Returns Node with slug='preview'."""
        if not data.managed or not data.host or not data.ssh_user:
            return Node(
                slug="preview",
                name=data.name,
                host=data.host,
                ssh_user=data.ssh_user,
                ssh_port=data.ssh_port,
                managed=data.managed,
                groups=data.groups,
                tags=data.tags,
                os_family=data.os_family,
                notes=data.notes,
                placement=data.placement,
                mac_address="",
            )
        probe = await probe_ssh_target(data.host, data.ssh_user, data.ssh_port)
        os_family = _os_to_family(probe.os) or data.os_family
        return Node(
            slug="preview",
            name=data.name or probe.name,
            host=probe.host,
            ssh_user=data.ssh_user,
            ssh_port=data.ssh_port,
            managed=data.managed,
            groups=data.groups,
            tags=data.tags or probe.tags,
            os_family=os_family,
            notes=data.notes,
            placement=data.placement,
            mac_address=probe.mac_address,
        )


node_manager = NodeManager()
