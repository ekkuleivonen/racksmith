"""Generate markdown documentation for Ansible-native format."""

from __future__ import annotations


def generate_docs() -> str:
    """Generate markdown documentation for Ansible-native layout."""
    return """# Ansible-Native Schema Reference

Racksmith uses standard Ansible file structures. All resources live under `.racksmith/` by default (configurable via `racksmith_dir` in `.racksmith/config.yml`).

## Layout (.racksmith/)

```
.racksmith/
  config.yml       # optional: racksmith_dir
  inventory/hosts.yml
  host_vars/{host_id}.yml
  group_vars/{group_id}.yml
  roles/{slug}/
  playbooks/{id}.yml
  racks.yml
  devices.yml
```

## Inventory (.racksmith/inventory/hosts.yml)

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

Racksmith extensions use the `racksmith_` prefix in `.racksmith/host_vars/{id}.yml` and `.racksmith/group_vars/{id}.yml`:

- `racksmith_name`, `racksmith_managed`, `racksmith_notes`, `racksmith_mac_address`
- `racksmith_os_family`, `racksmith_labels`
- `racksmith_rack`, `racksmith_position_u_start`, `racksmith_position_u_height`, etc.

## Roles (.racksmith/roles/<slug>/)

Each role has:

- `meta/main.yml` — `galaxy_info` and `argument_specs` (schema_version: `x_racksmith_schema_version`)
- `tasks/main.yml` — Ansible tasks
- `defaults/main.yml` — Role default variables (read-only in UI; imported roles get this from registry, local edits do not persist)

Legacy `action.yaml` format is supported for read/import only; Racksmith never writes `action.yaml`, only `meta/main.yml`.

## Playbooks (.racksmith/playbooks/*.yml)

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

## Schema Versioning

All `.racksmith/` files track a `schema_version`. Migrations run automatically when a repo is activated. See `docs/SCHEMA_VERSIONING.md` in the project repository for how to add migrations and handle breaking changes.
"""
