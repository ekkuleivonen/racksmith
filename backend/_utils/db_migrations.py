"""SQLite migration runner for schema_version."""

from __future__ import annotations

from collections.abc import Awaitable, Callable

import aiosqlite

from _utils.logging import get_logger

logger = get_logger(__name__)

MigrationFn = Callable[[aiosqlite.Connection], Awaitable[None]]

MIGRATIONS: dict[int, MigrationFn] = {
    # Add future migrations: 2: migrate_to_2, 3: migrate_to_3, etc.
}


async def get_schema_version(db: aiosqlite.Connection) -> int:
    """Return current DB schema version, or 0 if none."""
    result = await db.execute("SELECT version FROM schema_version LIMIT 1")
    row = await result.fetchone()
    if row is None:
        return 0
    return int(row[0])


async def set_schema_version(db: aiosqlite.Connection, version: int) -> None:
    """Set schema_version to the given value (replaces any existing row)."""
    await db.execute("DELETE FROM schema_version")
    await db.execute("INSERT INTO schema_version (version) VALUES (?)", (version,))
    await db.commit()


async def run_migrations(db: aiosqlite.Connection) -> None:
    """Run all pending migrations."""
    current = await get_schema_version(db)
    if current == 0:
        await set_schema_version(db, 1)
        current = 1
        logger.info("db_migrations_completed", version=1)
    for version in sorted(MIGRATIONS):
        if version > current:
            await MIGRATIONS[version](db)
            await set_schema_version(db, version)
            current = version
            logger.info("db_migrations_completed", version=version)
