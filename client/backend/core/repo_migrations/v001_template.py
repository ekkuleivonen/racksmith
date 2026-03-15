"""No-op migration: v0 -> v1.

This serves as a template for future migrations and proves the
auto-discovery system works.  Every repo opened after this lands
will be stamped at schema version 1.

To add a new migration:
  1. Copy this file as v002_short_description.py
  2. Override the up_*/down_* hooks you need
  3. Done — the runner discovers it automatically

Available hooks (override any combination):
  up_racksmith_meta(data)              / down_racksmith_meta(data)
  up_hosts_yml(data)                   / down_hosts_yml(data)
  up_host_vars(host_id, data)          / down_host_vars(host_id, data)
  up_group_vars(group_id, data)        / down_group_vars(group_id, data)
  up_playbook(playbook_id, data)       / down_playbook(playbook_id, data)
  up_role_meta(role_id, data)          / down_role_meta(role_id, data)
  up_role_defaults(role_id, data)      / down_role_defaults(role_id, data)
  up_role_tasks(role_id, data)         / down_role_tasks(role_id, data)
"""

from __future__ import annotations

from core.repo_migrations._base import RepoMigration


class Migration(RepoMigration):
    pass
