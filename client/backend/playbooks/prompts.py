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
        {"key": "device_path", "type": "string", "label": "Device path", "description": "Absolute path to the block device to operate on (e.g. /dev/sda or /dev/disk/by-id/...)"}
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
    (e.g. a discovery role before and after a formatting role,
     or a directory-creation role repeated once per directory).
  - Set become: true if any role requires privilege escalation (most system-level ops do).
  - For secret inputs (secret: true), do NOT set values in vars — they are prompted at runtime.
  - For "create" roles, write a DETAILED generation_prompt that specifies:
      * The exact Ansible modules to use (fully-qualified collection names)
      * Logic, conditionals, loops, handlers, templates
      * How the role should use its inputs and produce its outputs via set_fact
  - expected_inputs and expected_outputs on "create" roles define the role's interface.
    Downstream roles can reference outputs from earlier roles using {{ fact_name }} in their vars.
  - Each expected_input should include a "description" — a helpful sentence explaining what
    the input controls, any constraints, and examples of valid values. This is shown as a
    tooltip in the UI.
  - Input type must be one of: "string", "bool", "secret".
    NEVER use "list" or "dict" as an input type. Design roles with scalar inputs
    that can be added multiple times in the playbook instead.
  - Output type must be one of: "string", "boolean".
  - IMPORTANT: Every role that uses set_fact MUST declare those facts as expected_outputs.
    Downstream roles can only link to outputs that are explicitly declared.
  - Prefer SIMPLICITY. Roles should have minimal inputs (1-3 required) with sensible defaults.
    Do not expose low-level knobs (e.g. fstab dump/passno, mkfs extra opts) as inputs
    unless the user explicitly asks for them. Hardcode sensible values in tasks."""

_EXAMPLE = """\
Example — a playbook for formatting a disk, creating a directory, and mounting reliably:

{
  "name": "Storage Setup",
  "description": "Format SSD, create mount directory, and configure persistent mount",
  "become": true,
  "roles": [
    {
      "action": "create",
      "name": "Storage Discover",
      "description": "Discover the target block device and expose facts for downstream roles",
      "generation_prompt": "Create an Ansible role that resolves a device selector to a canonical path using readlink -f, validates it is a block device, collects lsblk and blkid metadata, and exposes discovered_device_path (string) and discovered_uuid (string) via set_fact.",
      "expected_inputs": [
        {"key": "target_disk", "type": "string", "label": "Target disk", "description": "Absolute path or /dev/disk/by-id/ symlink for the block device to discover", "required": true, "placeholder": "/dev/disk/by-id/..."}
      ],
      "expected_outputs": [
        {"key": "discovered_device_path", "description": "Canonical block device path", "type": "string"},
        {"key": "discovered_uuid", "description": "Filesystem UUID (empty if unformatted)", "type": "string"}
      ],
      "vars": {}
    },
    {
      "action": "create",
      "name": "Storage Format",
      "description": "Partition and format the target disk with ext4",
      "generation_prompt": "Create an Ansible role that partitions a block device using community.general.parted with a single GPT partition, then formats it with mkfs.ext4. Skip formatting if the device already has the requested filesystem. Expose the new UUID via set_fact.",
      "expected_inputs": [
        {"key": "device_path", "type": "string", "label": "Device path", "description": "Canonical block device path to partition and format (e.g. /dev/sda)", "required": true}
      ],
      "expected_outputs": [
        {"key": "formatted_uuid", "description": "UUID of the formatted filesystem", "type": "string"}
      ],
      "vars": {"device_path": "{{ discovered_device_path }}"}
    },
    {
      "action": "create",
      "name": "Storage Mount",
      "description": "Mount the filesystem persistently via fstab",
      "generation_prompt": "Create an Ansible role that uses ansible.posix.mount with state=mounted to mount a filesystem by UUID. Ensure the mount point directory exists first. Hardcode sensible fstab defaults (dump=0, passno=2, opts=defaults,noatime).",
      "expected_inputs": [
        {"key": "mount_uuid", "type": "string", "label": "Filesystem UUID", "description": "UUID of the filesystem to mount (from blkid or a previous format step)", "required": true},
        {"key": "mount_point", "type": "string", "label": "Mount point", "description": "Absolute path where the filesystem will be mounted (e.g. /mnt/data)", "required": true}
      ],
      "expected_outputs": [],
      "vars": {"mount_uuid": "{{ formatted_uuid }}", "mount_point": "/mnt/data"}
    },
    {
      "action": "create",
      "name": "Ensure Directory",
      "description": "Create a directory with specified ownership and permissions",
      "generation_prompt": "Create an Ansible role that ensures a single directory exists using ansible.builtin.file with state=directory. Accept path, owner, group, and mode as inputs.",
      "expected_inputs": [
        {"key": "directory_path", "type": "string", "label": "Directory path", "description": "Absolute path of the directory to create (e.g. /mnt/data/app)", "required": true},
        {"key": "owner", "type": "string", "label": "Owner", "description": "System user that will own the directory", "default": "root"},
        {"key": "group", "type": "string", "label": "Group", "description": "System group that will own the directory", "default": "root"},
        {"key": "mode", "type": "string", "label": "Mode", "description": "Octal permission mode for the directory (e.g. 0755, 0700)", "default": "0755"}
      ],
      "expected_outputs": [],
      "vars": {"directory_path": "/mnt/data/app"}
    },
    {
      "action": "reuse",
      "role_id": "ensure-directory",
      "vars": {"directory_path": "/mnt/data/logs", "owner": "app", "group": "app"}
    }
  ]
}

Note how "Ensure Directory" is created once then REUSED for the second directory
with different vars. This is the pattern for handling multiple items — repeat the
role, never use list inputs."""


PLANNER_THINKING_INSTRUCTIONS = """\
Think step-by-step about how to plan this Ansible playbook.
Consider which existing roles from the catalog can be reused, which new roles
need to be created, and the correct execution order.
Be concise (3-8 sentences). Focus on key architectural decisions."""

ROLE_THINKING_INSTRUCTIONS = """\
Think step-by-step about how to build this Ansible role.
Consider which Ansible modules to use, what the tasks should do, and any key
implementation choices (idempotency, error handling, facts to expose).
Be concise (2-5 sentences)."""


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
