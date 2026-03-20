"""Consolidate registry_uuid into registry_id in .racksmith.yml.

Previously, roles/playbooks stored both ``registry_id`` (the slug) and
``registry_uuid`` (the actual UUID).  Now ``registry_id`` holds the UUID
directly and ``registry_uuid`` is removed.
"""

from __future__ import annotations

from core.repo_migrations._base import RepoMigration


def _promote_uuid(data: dict) -> dict:
    for section in ("roles", "playbooks"):
        items = data.get(section)
        if not isinstance(items, dict):
            continue
        for meta in items.values():
            if not isinstance(meta, dict):
                continue
            uuid_val = meta.pop("registry_uuid", None)
            if uuid_val:
                meta["registry_id"] = str(uuid_val)
    return data


def _demote_uuid(data: dict) -> dict:
    for section in ("roles", "playbooks"):
        items = data.get(section)
        if not isinstance(items, dict):
            continue
        for meta in items.values():
            if not isinstance(meta, dict):
                continue
            current = meta.get("registry_id", "")
            if current and "-" in str(current):
                meta["registry_uuid"] = current
    return data


class Migration(RepoMigration):
    def up_racksmith_meta(self, data: dict) -> dict:
        return _promote_uuid(data)

    def down_racksmith_meta(self, data: dict) -> dict:
        return _demote_uuid(data)
