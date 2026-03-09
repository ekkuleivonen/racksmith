"""SQLite database utilities for persistent run storage."""

from __future__ import annotations

import json
from pathlib import Path
from typing import TYPE_CHECKING

import aiosqlite

import settings

if TYPE_CHECKING:
    from playbooks.schemas import PlaybookRun
    from roles.schemas import RoleRun

_db: aiosqlite.Connection | None = None


async def init_db() -> None:
    """Create playbook_runs and role_runs tables if they do not exist. Opens a persistent connection."""
    global _db
    Path(settings.DB_PATH).parent.mkdir(parents=True, exist_ok=True)
    _db = await aiosqlite.connect(settings.DB_PATH)
    _db.row_factory = aiosqlite.Row
    await _db.execute(
        """
        CREATE TABLE IF NOT EXISTS playbook_runs (
            id          TEXT PRIMARY KEY,
            user_id     TEXT NOT NULL,
            playbook_id TEXT NOT NULL,
            playbook_name TEXT NOT NULL,
            status      TEXT NOT NULL,
            created_at  TEXT NOT NULL,
            started_at  TEXT,
            finished_at TEXT,
            exit_code   INTEGER,
            hosts       TEXT NOT NULL,
            output      TEXT NOT NULL DEFAULT '',
            commit_sha  TEXT
        )
        """
    )
    await _db.execute(
        """
        CREATE TABLE IF NOT EXISTS role_runs (
            id          TEXT PRIMARY KEY,
            user_id     TEXT NOT NULL,
            role_slug   TEXT NOT NULL,
            role_name   TEXT NOT NULL,
            status      TEXT NOT NULL,
            created_at  TEXT NOT NULL,
            started_at  TEXT,
            finished_at TEXT,
            exit_code   INTEGER,
            hosts       TEXT NOT NULL,
            output      TEXT NOT NULL DEFAULT '',
            vars        TEXT NOT NULL DEFAULT '{}',
            become      INTEGER NOT NULL DEFAULT 0,
            commit_sha  TEXT
        )
        """
    )
    await _db.commit()


async def close_db() -> None:
    """Close the database connection."""
    global _db
    if _db is not None:
        await _db.close()
        _db = None


def _get_db() -> aiosqlite.Connection:
    if _db is None:
        raise RuntimeError("Database not initialized. Call init_db() first.")
    return _db


def row_to_playbook_run(row: aiosqlite.Row) -> "PlaybookRun":
    """Convert a database row to a PlaybookRun schema."""
    from playbooks.schemas import PlaybookRun

    hosts = json.loads(row["hosts"]) if isinstance(row["hosts"], str) else row["hosts"]
    commit_sha = row["commit_sha"] if "commit_sha" in row.keys() else None
    return PlaybookRun(
        id=row["id"],
        playbook_id=row["playbook_id"],
        playbook_name=row["playbook_name"],
        status=row["status"],
        created_at=row["created_at"],
        started_at=row["started_at"],
        finished_at=row["finished_at"],
        exit_code=row["exit_code"],
        hosts=hosts,
        output=row["output"] or "",
        commit_sha=commit_sha,
    )


def row_to_role_run(row: aiosqlite.Row) -> "RoleRun":
    """Convert a database row to a RoleRun schema."""
    from roles.schemas import RoleRun

    hosts = json.loads(row["hosts"]) if isinstance(row["hosts"], str) else row["hosts"]
    run_vars = json.loads(row["vars"]) if isinstance(row["vars"], str) else row["vars"]
    return RoleRun(
        id=row["id"],
        role_slug=row["role_slug"],
        role_name=row["role_name"],
        status=row["status"],
        created_at=row["created_at"],
        started_at=row["started_at"],
        finished_at=row["finished_at"],
        exit_code=row["exit_code"],
        hosts=hosts,
        output=row["output"] or "",
        vars=run_vars,
        become=bool(row["become"]),
        commit_sha=row["commit_sha"],
    )
