"""System prompts for AI playbook generation (planner agent)."""

from __future__ import annotations

import json
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from playbooks.schemas import RoleCatalogEntry

_PLAN_SCHEMA = """\
Output a single JSON object with this structure:

{
  "name": "Human-readable playbook name",
  "description": "Short summary of what this playbook does",
  "become": true,
  "roles": [
    {
      "action": "reuse",
      "role_id": "existing_role_id_from_catalog",
      "vars": { "var_name": "value" }
    },
    {
      "action": "create",
      "name": "New Role Name",
      "description": "What this role does",
      "generation_prompt": "Detailed instructions for generating the Ansible tasks ...",
      "expected_inputs": [
        {"key": "device_path", "type": "string", "label": "Device path", "description": "Block device to operate on"}
      ],
      "expected_outputs": [
        {"key": "disk_uuid", "description": "UUID of the filesystem", "type": "string"}
      ],
      "vars": { "device_path": "/dev/sda1" }
    }
  ]
}"""

_RULES = """\
Rules:
  - REUSE existing roles from the catalog when they match the requirement.
    Only create new roles when no existing role fits.
  - Order roles logically — dependencies MUST come before dependents.
  - The SAME role can appear multiple times in the roles list
    (e.g. a discovery role before and after a formatting role).
  - Set become: true if any role requires privilege escalation (most system-level ops do).
  - For secret inputs (secret: true), do NOT set values in vars — they are prompted at runtime.
  - For "create" roles, write a DETAILED generation_prompt that specifies:
      * The exact Ansible modules to use (fully-qualified collection names)
      * Logic, conditionals, loops, handlers, templates
      * How the role should use its inputs and produce its outputs via set_fact
  - expected_inputs and expected_outputs on "create" roles define the role's interface.
    Downstream roles can reference outputs from earlier roles using {{ fact_name }} in their vars.
  - Input type must be one of: "string", "bool", "secret", "list", "dict".
  - Output type must be one of: "string", "boolean", "list", "dict"."""

_EXAMPLE = """\
Example — a playbook for formatting a disk, creating directories, and mounting reliably:

{
  "name": "Storage Setup",
  "description": "Format SSD, create mount directories, and configure persistent mounts",
  "become": true,
  "roles": [
    {
      "action": "create",
      "name": "Storage Discover",
      "description": "Discover attached block devices and their properties",
      "generation_prompt": "Create an Ansible role that discovers block devices using ansible.builtin.command with lsblk --json. Parse the output with ansible.builtin.set_fact to expose discovered_devices (list) and primary_device (string). Handle the case where no suitable device is found by failing with a clear message.",
      "expected_inputs": [
        {"key": "target_device_hint", "type": "string", "label": "Device hint", "description": "Optional device path hint (e.g. /dev/sdb)", "default": ""}
      ],
      "expected_outputs": [
        {"key": "discovered_device", "description": "Primary block device path", "type": "string"},
        {"key": "discovered_uuid", "description": "Filesystem UUID (empty if unformatted)", "type": "string"}
      ],
      "vars": {}
    },
    {
      "action": "create",
      "name": "Storage Partition Format",
      "description": "Partition and format a block device with ext4",
      "generation_prompt": "Create an Ansible role that partitions a block device using community.general.parted and formats it with ansible.builtin.command running mkfs.ext4. Only format if the device has no existing filesystem (check with ansible.builtin.command blkid). Use the inputs device_path and fstype. After formatting, use set_fact to expose the new filesystem UUID.",
      "expected_inputs": [
        {"key": "device_path", "type": "string", "label": "Device path", "required": true},
        {"key": "fstype", "type": "string", "label": "Filesystem type", "default": "ext4"}
      ],
      "expected_outputs": [
        {"key": "formatted_uuid", "description": "UUID of the newly formatted filesystem", "type": "string"}
      ],
      "vars": {"device_path": "{{ discovered_device }}"}
    },
    {
      "action": "create",
      "name": "Storage Directories",
      "description": "Create mount point directories with proper ownership",
      "generation_prompt": "Create an Ansible role that takes a list of directory specs and creates each directory using ansible.builtin.file with the specified path, owner, group, and mode. Loop over the directories input list.",
      "expected_inputs": [
        {"key": "directories", "type": "list", "label": "Directories", "default": [{"path": "/mnt/data", "owner": "root", "group": "root", "mode": "0755"}]}
      ],
      "expected_outputs": [],
      "vars": {}
    },
    {
      "action": "create",
      "name": "Storage Mount",
      "description": "Configure persistent mounts via fstab",
      "generation_prompt": "Create an Ansible role that mounts a filesystem using ansible.posix.mount with state=mounted. Configure it with the UUID, mount point, filesystem type, and mount options. This ensures the mount persists in /etc/fstab across reboots.",
      "expected_inputs": [
        {"key": "mount_uuid", "type": "string", "label": "Filesystem UUID", "required": true},
        {"key": "mount_point", "type": "string", "label": "Mount point", "required": true},
        {"key": "fstype", "type": "string", "label": "Filesystem type", "default": "ext4"},
        {"key": "mount_opts", "type": "string", "label": "Mount options", "default": "defaults,noatime"}
      ],
      "expected_outputs": [],
      "vars": {"mount_uuid": "{{ formatted_uuid }}", "mount_point": "/mnt/data"}
    }
  ]
}"""


def build_planner_system_prompt(catalog: list[RoleCatalogEntry]) -> str:
    """Build the full planner system prompt with the current roles catalog."""
    catalog_entries = []
    for role in catalog:
        entry: dict = {
            "id": role.id,
            "name": role.name,
            "description": role.description,
        }
        if role.inputs:
            entry["inputs"] = [
                {k: v for k, v in inp.model_dump(exclude_defaults=True).items() if v}
                | {"key": inp.key}
                for inp in role.inputs
            ]
        if role.outputs:
            entry["outputs"] = [
                {k: v for k, v in out.model_dump(exclude_defaults=True).items() if v}
                | {"key": out.key}
                for out in role.outputs
            ]
        catalog_entries.append(entry)

    catalog_json = json.dumps(catalog_entries, indent=2) if catalog_entries else "[]"

    return f"""\
You are a Racksmith playbook planner. Given a user request, you plan a playbook \
that composes Ansible roles to accomplish the goal.

Output ONLY a single JSON object. No markdown code fences. No explanations.

AVAILABLE ROLES (you may reuse these by setting action to "reuse"):
{catalog_json}

{_PLAN_SCHEMA}

{_RULES}

{_EXAMPLE}"""
