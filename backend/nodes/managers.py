"""Node business logic backed by the active local repo."""

from __future__ import annotations

import asyncio
import secrets
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


def ansible_safe_name(name: str) -> str:
    """Replace characters invalid in Ansible host/group names with underscores."""
    return name.replace("-", "_")


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _generate_node_id(repo_path: Path) -> str:
    for _ in range(100):
        candidate = f"n-{secrets.token_hex(3)}"
        if not (repo_path / NODES_DIR / f"{candidate}.yaml").exists():
            return candidate
    raise RuntimeError("Failed to generate unique node ID")


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


def _node_from_yaml(node_id: str, data: dict) -> Node:
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
    ip_address = data.get("ip_address") or data.get("host", "")
    return Node(
        id=node_id,
        hostname=data.get("hostname", ""),
        name=data.get("name", ""),
        ip_address=ip_address,
        ssh_user=data.get("ssh_user", ""),
        ssh_port=data.get("ssh_port", 22),
        managed=data.get("managed", True),
        groups=data.get("groups", []),
        labels=data.get("labels", []),
        os_family=data.get("os_family"),
        notes=data.get("notes", ""),
        placement=placement,
        mac_address=data.get("mac_address", ""),
    )


def _node_to_yaml(node: Node) -> dict:
    """Serialize Node to YAML dict (flat placement)."""
    out: dict = {
        "id": node.id,
        "hostname": node.hostname,
        "name": node.name,
        "ip_address": node.ip_address,
        "ssh_user": node.ssh_user,
        "ssh_port": node.ssh_port,
        "managed": node.managed,
        "groups": node.groups,
        "labels": node.labels,
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

    def _node_file(self, repo_path: Path, node_id: str) -> Path:
        return self._nodes_dir(repo_path) / f"{node_id}.yaml"

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
                node_id = path.stem
                nodes.append(_node_from_yaml(node_id, data or {}))
            except (OSError, yaml.YAMLError):
                continue

        hosts: dict[str, dict] = {}
        children: dict[str, dict] = {}

        for node in nodes:
            if not node.managed or not node.ip_address or not node.ssh_user:
                continue
            host_name = ansible_safe_name(node.id)
            hosts[host_name] = {
                "ansible_host": node.ip_address,
                "ansible_user": node.ssh_user,
                "ansible_port": node.ssh_port,
                "ansible_python_interpreter": "auto_silent",
            }
            if settings.SSH_DISABLE_HOST_KEY_CHECK:
                hosts[host_name]["ansible_ssh_common_args"] = (
                    "-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null"
                )
            if node.os_family:
                hosts[host_name]["os_family"] = node.os_family
            if node.labels:
                hosts[host_name]["labels"] = node.labels

            for group in node.groups:
                group_name = ansible_safe_name(group)
                if group_name not in children:
                    children[group_name] = {"hosts": {}}
                children[group_name]["hosts"][host_name] = {}

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
                node_id = path.stem
                nodes.append(_node_from_yaml(node_id, data or {}))
            except (OSError, yaml.YAMLError):
                continue
        return sorted(
            nodes,
            key=lambda n: (
                (n.name or n.hostname or n.ip_address or n.id).lower(),
                n.id,
            ),
        )

    def get_node(self, session, node_id: str) -> Node:
        repo_path = repos_manager.active_repo_path(session)
        path = self._node_file(repo_path, node_id)
        if not path.is_file():
            raise KeyError(f"Node {node_id} not found")
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
        return _node_from_yaml(node_id, data or {})

    def create_node(self, session, data: NodeInput) -> Node:
        repo_path = repos_manager.active_repo_path(session)
        node_id = _generate_node_id(repo_path)

        node = Node(
            id=node_id,
            hostname="",
            name=data.name.strip(),
            ip_address=data.ip_address.strip(),
            ssh_user=data.ssh_user.strip(),
            ssh_port=data.ssh_port,
            managed=data.managed,
            groups=data.groups,
            labels=data.labels,
            os_family=data.os_family,
            notes=data.notes,
            placement=data.placement,
            mac_address="",
        )
        nodes_dir = self._nodes_dir(repo_path)
        nodes_dir.mkdir(parents=True, exist_ok=True)
        self._node_file(repo_path, node_id).write_text(
            yaml.safe_dump(_node_to_yaml(node), sort_keys=False), encoding="utf-8"
        )
        self._regenerate_inventory(repo_path)
        return node

    def update_node(self, session, node_id: str, data: NodeInput) -> Node:
        repo_path = repos_manager.active_repo_path(session)
        existing = self.get_node(session, node_id)
        name = data.name.strip() if data.name and data.name.strip() else existing.name
        ip_address = data.ip_address.strip() if data.ip_address and data.ip_address.strip() else existing.ip_address
        node = Node(
            id=node_id,
            hostname=existing.hostname,
            name=name,
            ip_address=ip_address,
            ssh_user=data.ssh_user.strip(),
            ssh_port=data.ssh_port,
            managed=data.managed,
            groups=data.groups,
            labels=data.labels,
            os_family=data.os_family or existing.os_family,
            notes=data.notes,
            placement=data.placement,
            mac_address=existing.mac_address,
        )
        self._node_file(repo_path, node_id).write_text(
            yaml.safe_dump(_node_to_yaml(node), sort_keys=False), encoding="utf-8"
        )
        self._regenerate_inventory(repo_path)
        return node

    def delete_node(self, session, node_id: str) -> None:
        repo_path = repos_manager.active_repo_path(session)
        path = self._node_file(repo_path, node_id)
        if not path.is_file():
            raise KeyError(f"Node {node_id} not found")
        path.unlink(missing_ok=True)
        self._regenerate_inventory(repo_path)

    async def probe_node(self, session, node_id: str) -> Node:
        node = self.get_node(session, node_id)
        if not node.managed or not node.ip_address or not node.ssh_user:
            raise ValueError("Node is not managed or missing ip_address/ssh_user")
        probe = await probe_ssh_target(node.ip_address, node.ssh_user, node.ssh_port)
        os_family = _os_to_family(probe.os) or node.os_family
        updated = Node(
            id=node.id,
            hostname=probe.name,
            name=node.name,
            ip_address=probe.ip_address,
            ssh_user=node.ssh_user,
            ssh_port=node.ssh_port,
            managed=node.managed,
            groups=node.groups,
            labels=node.labels or probe.labels,
            os_family=os_family,
            notes=node.notes,
            placement=node.placement,
            mac_address=probe.mac_address,
        )
        repo_path = repos_manager.active_repo_path(session)
        self._node_file(repo_path, node_id).write_text(
            yaml.safe_dump(_node_to_yaml(updated), sort_keys=False), encoding="utf-8"
        )
        self._regenerate_inventory(repo_path)
        return updated

    async def preview_node(self, data: NodeInput) -> Node:
        """Probe without saving. Returns Node with id='preview'."""
        if not data.managed or not data.ip_address or not data.ssh_user:
            return Node(
                id="preview",
                hostname="",
                name=data.name,
                ip_address=data.ip_address,
                ssh_user=data.ssh_user,
                ssh_port=data.ssh_port,
                managed=data.managed,
                groups=data.groups,
                labels=data.labels,
                os_family=data.os_family,
                notes=data.notes,
                placement=data.placement,
                mac_address="",
            )
        probe = await probe_ssh_target(data.ip_address, data.ssh_user, data.ssh_port)
        os_family = _os_to_family(probe.os) or data.os_family
        return Node(
            id="preview",
            hostname=probe.name,
            name=data.name or probe.name,
            ip_address=probe.ip_address,
            ssh_user=data.ssh_user,
            ssh_port=data.ssh_port,
            managed=data.managed,
            groups=data.groups,
            labels=data.labels or probe.labels,
            os_family=os_family,
            notes=data.notes,
            placement=data.placement,
            mac_address=probe.mac_address,
        )


node_manager = NodeManager()
