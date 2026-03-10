"""Unit tests for _utils helpers."""

from __future__ import annotations

import json


def _make_row(data: dict):
    """Create a dict-like object matching aiosqlite.Row interface."""
    return type("Row", (), {"__getitem__": lambda self, k: data[k], "keys": lambda self: data.keys()})()


class TestRowToPlaybookRun:
    def test_converts_row(self) -> None:
        row = _make_row({
            "id": "run1",
            "playbook_id": "pb1",
            "playbook_name": "Test",
            "status": "completed",
            "created_at": "2024-01-01T00:00:00",
            "started_at": "2024-01-01T00:01:00",
            "finished_at": "2024-01-01T00:02:00",
            "exit_code": 0,
            "hosts": json.dumps(["web1", "web2"]),
            "output": "ok",
            "commit_sha": "abc123",
        })
        from _utils.db import row_to_playbook_run
        run = row_to_playbook_run(row)
        assert run.id == "run1"
        assert run.playbook_id == "pb1"
        assert run.status == "completed"
        assert run.hosts == ["web1", "web2"]
        assert run.commit_sha == "abc123"


class TestRowToRoleRun:
    def test_converts_row(self) -> None:
        row = _make_row({
            "id": "run1",
            "role_slug": "my_role",
            "role_name": "My Role",
            "status": "completed",
            "created_at": "2024-01-01T00:00:00",
            "started_at": "2024-01-01T00:01:00",
            "finished_at": "2024-01-01T00:02:00",
            "exit_code": 0,
            "hosts": json.dumps(["web1"]),
            "output": "ok",
            "vars": json.dumps({"param": "value"}),
            "become": 1,
            "commit_sha": "abc123",
        })
        from _utils.db import row_to_role_run
        run = row_to_role_run(row)
        assert run.id == "run1"
        assert run.role_slug == "my_role"
        assert run.status == "completed"
        assert run.hosts == ["web1"]
        assert run.vars == {"param": "value"}
        assert run.become is True
