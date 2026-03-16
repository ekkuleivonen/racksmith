"""System prompts for AI-generated roles (JSON mode)."""

_SCHEMA_DESCRIPTION = """\
Required top-level keys:
  name        – human-readable name
  description – short summary

Optional top-level keys:
  labels        – list of tags (e.g. ["web", "nginx"])
  compatibility – object with os_family list (e.g. {"os_family": ["debian", "redhat"]})
  inputs        – list of variable definitions (see below)
  outputs       – list of facts this role produces via set_fact (see below)
  tasks         – list of Ansible tasks (written to tasks/main.yml)

Each input item has these fields:
  key         – variable name (snake_case)
  label       – short human-readable label (2-4 words, used as the field name in the UI)
  description – a helpful sentence explaining what this input controls, any constraints,
                and examples of valid values. This is shown as a tooltip so the user
                understands what to enter. Be specific and practical, e.g.
                "TCP port Nginx will listen on for HTTP traffic (e.g. 80, 8080)"
                rather than just "Port".
  type        – MUST be exactly one of: "string", "bool", "secret"
                (never use "str", "boolean", "int", "select", "list", "dict",
                 or any other type name)
  placeholder – hint text (string, use "" if not applicable)
  default     – default value (string for string/secret, true/false for bool)
  required    – true or false
  options     – list of allowed choices (renders as a dropdown); use [] when any value is accepted
  secret      – true if the value should be prompted at runtime (never stored), false otherwise

Each output item declares a fact the role produces via set_fact:
  key         – fact variable name (snake_case)
  description – what the fact contains
  type        – one of: "string", "boolean" (default "string")

IMPORTANT: Every set_fact in the tasks MUST have a matching entry in outputs.
If a role uses set_fact, those facts MUST be declared as outputs.

Design for simplicity:
  - Keep required inputs to the absolute minimum (1-3).
  - Prefer sensible defaults and convention over configuration.
  - Omit niche inputs entirely (e.g. fstab dump/passno, mkfs extra opts) —
    hardcode sensible values in the tasks instead.
  - NEVER use "list" or "dict" input types. All inputs must be scalar.
    Design roles that accept one item at a time and can be added to a
    playbook multiple times instead.
  - When in doubt, leave it out. The user can always edit the role later.

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
      "description": "TCP port Nginx will listen on for HTTP traffic (e.g. 80, 8080)",
      "type": "string",
      "placeholder": "80",
      "required": true
    },
    {
      "key": "enable_ssl",
      "label": "Enable SSL",
      "description": "When true, generates a self-signed certificate and enables HTTPS on port 443",
      "type": "bool",
      "default": true,
      "required": false
    }
  ],
  "outputs": [
    {"key": "nginx_config_path", "description": "Path to the generated Nginx config file", "type": "string"}
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
