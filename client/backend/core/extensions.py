"""Racksmith var handling — racksmith_ prefix convention."""

from __future__ import annotations

PREFIX = "racksmith_"

# Host keys that live in host_vars (targetable by Ansible playbooks/templates)
HOST_EXTENSION_KEYS = {
    "racksmith_name",
    "racksmith_managed",
    "racksmith_mac_address",
    "racksmith_os_family",
    "racksmith_labels",
}

# Host keys that live in .racksmith.yml hosts section (UI-only, not Ansible-targetable).
# Stored WITHOUT prefix since they're inside the racksmith namespace already.
HOST_META_ONLY_KEYS = {
    "rack",
    "position_u_start",
    "position_u_height",
    "position_col_start",
    "position_col_count",
}

GROUP_EXTENSION_KEYS = {"racksmith_name", "racksmith_description"}


def extract(all_vars: dict) -> tuple[dict, dict]:
    """Split host/group vars into (ansible_and_user_vars, racksmith_vars).

    Strips the prefix from racksmith keys.
    """
    ansible_vars: dict = {}
    racksmith_vars: dict = {}
    for key, value in all_vars.items():
        if is_extension(key):
            stripped = key[len(PREFIX) :]
            racksmith_vars[stripped] = value
        else:
            ansible_vars[key] = value
    return ansible_vars, racksmith_vars


def inject(racksmith_vars: dict) -> dict:
    """Add racksmith_ prefix to keys for writing back to YAML."""
    return {f"{PREFIX}{k}": v for k, v in racksmith_vars.items()}


def is_extension(key: str) -> bool:
    """Check if a key is a racksmith extension var."""
    return key.startswith(PREFIX)
