"""Generate markdown documentation for Ansible-native format."""

from __future__ import annotations


def generate_docs() -> str:
    """Generate markdown documentation for Ansible-native layout."""
    return """# Ansible-Native Schema Reference

Racksmith uses standard Ansible file structures. Paths are resolved via `.racksmith/config.yml` and `ansible.cfg`.

## Inventory (inventory/hosts.yml)

Hosts and groups follow Ansible inventory format:

```yaml
all:
  hosts:
    host_id:
      ansible_host: 192.168.1.10
      ansible_user: admin
      ansible_port: 22
  children:
    my_group:
      hosts:
        host_id: {}
```

Racksmith extensions use the `racksmith_` prefix in `host_vars/{id}.yml` and `group_vars/{id}.yml`:

- `racksmith_name`, `racksmith_managed`, `racksmith_notes`, `racksmith_mac_address`
- `racksmith_os_family`, `racksmith_labels`
- `racksmith_rack`, `racksmith_position_u_start`, `racksmith_position_u_height`, etc.

## Roles (roles/<slug>/)

Each role has:

- `meta/main.yml` — `galaxy_info` and `argument_specs`
- `tasks/main.yml` — Ansible tasks

Legacy `action.yaml` format is also supported for migration.

## Playbooks (playbooks/*.yml)

Standard Ansible playbook format. Description is stored in play vars as `racksmith_description`.

## Racks (.racksmith/racks.yml)

Single consolidated file for rack metadata:

```yaml
rack_id:
  name: Rack 1
  rack_units: 12
  rack_width_inches: 19
  rack_cols: 1
  created_at: "..."
  updated_at: "..."
```
"""
