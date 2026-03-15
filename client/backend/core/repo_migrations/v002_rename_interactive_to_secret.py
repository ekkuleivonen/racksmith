"""Rename role input hint ``interactive`` → ``secret`` in .racksmith.yml.

The ``interactive`` key stored under ``roles.<id>.inputs.<key>`` is
renamed to ``secret`` to better reflect its purpose (the value is
prompted at runtime and never persisted).
"""

from __future__ import annotations

from core.repo_migrations._base import RepoMigration


def _rename_input_key(data: dict, old: str, new: str) -> dict:
    roles = data.get("roles")
    if not isinstance(roles, dict):
        return data
    for role_meta in roles.values():
        if not isinstance(role_meta, dict):
            continue
        inputs = role_meta.get("inputs")
        if not isinstance(inputs, dict):
            continue
        for inp_meta in inputs.values():
            if not isinstance(inp_meta, dict):
                continue
            if old in inp_meta:
                inp_meta[new] = inp_meta.pop(old)
    return data


class Migration(RepoMigration):
    def up_racksmith_meta(self, data: dict) -> dict:
        return _rename_input_key(data, "interactive", "secret")

    def down_racksmith_meta(self, data: dict) -> dict:
        return _rename_input_key(data, "secret", "interactive")
