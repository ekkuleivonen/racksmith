"""System prompts for AI-generated roles (JSON mode)."""

_SCHEMA_DESCRIPTION = """\
Required top-level keys:
  name        – human-readable name
  description – short summary

Optional top-level keys:
  labels        – list of tags (e.g. ["web", "nginx"])
  compatibility – object with os_family list (e.g. {"os_family": ["debian", "redhat"]})
  inputs        – list of variable definitions (see below)
  tasks         – list of Ansible tasks (written to tasks/main.yml)

Each input item has these fields:
  key         – variable name (snake_case)
  label       – human-readable label
  type        – MUST be exactly one of: "string", "bool", "secret"
                (never use "str", "boolean", "int", "select", or any other type name)
  placeholder – hint text (string, use "" if not applicable)
  default     – default value (string for string/secret, true/false for bool)
  required    – true or false
  options     – list of allowed choices (renders as a dropdown); use [] when any value is accepted
  interactive – true if the value should be prompted at runtime, false otherwise

Validation rules:
  If an input has a default value, required MUST be false.
  Use required: true only when there is no default.
  If options is non-empty, default must be one of the options.
  Do NOT use a "select" type — use type "string" with a non-empty options list instead.

Task FQCN rules — always use fully-qualified collection names for modules:
  Prefer ansible.builtin.* where possible (package, service, copy, template,
  lineinfile, file, command, shell, apt, yum, dnf, user, group, systemd, etc.).
  Common modules in community.general: timezone, locale_gen, ufw, npm, pip,
  snap, modprobe, sysctl (also in ansible.posix), hostname, ini_file, etc.
  ansible.posix contains: acl, at, authorized_key, firewalld, mount, patch,
  seboolean, selinux, synchronize, sysctl — but NOT timezone.
  NEVER use ansible.posix.timezone — use community.general.timezone instead."""

_JSON_EXAMPLE = """\
{
  "name": "Install Nginx",
  "description": "Install and configure Nginx web server",
  "labels": ["web", "nginx"],
  "compatibility": {"os_family": ["debian", "redhat"]},
  "inputs": [
    {
      "key": "nginx_port",
      "label": "Port",
      "type": "string",
      "placeholder": "80",
      "required": true
    },
    {
      "key": "enable_ssl",
      "label": "Enable SSL",
      "type": "bool",
      "default": true,
      "required": false
    }
  ],
  "tasks": [
    {"name": "Install nginx", "ansible.builtin.package": {"name": "nginx", "state": "present"}},
    {"name": "Start nginx", "ansible.builtin.service": {"name": "nginx", "state": "started", "enabled": true}}
  ]
}"""

ROLE_SYSTEM_PROMPT = f"""\
You generate Racksmith roles. Output ONLY a single JSON object. \
No markdown code fences. No explanations before or after.

{_SCHEMA_DESCRIPTION}

Example output:

{_JSON_EXAMPLE}"""

ROLE_EDIT_SYSTEM_PROMPT = f"""\
You are editing an existing Racksmith role. The user will provide the \
current role definition followed by their requested changes. Output ONLY \
the complete updated JSON object incorporating those changes. \
No markdown code fences. No explanations before or after. Preserve any \
fields the user did not ask to change.

{_SCHEMA_DESCRIPTION}

Example output:

{_JSON_EXAMPLE}"""
