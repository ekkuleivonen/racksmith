# Schema Versioning and Breaking Changes

Racksmith uses schema versioning in three layers. This document describes how versioning works and how to handle breaking changes.

## Overview

| Layer | Location | Version source | Migration tool |
|-------|----------|----------------|----------------|
| YAML in user repos | `.racksmith/` | `version.yml` or `racks.yml` | `ansible.migrations.migrate_repo()` |
| Backend SQLite | `data/racksmith.db` | `schema_version` table | `_utils.db_migrations.run_migrations()` |
| Registry PostgreSQL | Registry DB | Alembic revisions | `alembic upgrade head` |

## YAML schema (`.racksmith/` in user repos)

### Version file

The authoritative version is stored in `.racksmith/version.yml`:

```yaml
schema_version: 1
racksmith_version: "1.0.0"
```

- `schema_version`: Layout/structure version of `.racksmith/` files. Incremented when file formats or directory structure changes.
- `racksmith_version`: App version that last wrote the config (informational).

### When migrations run

`migrate_repo()` is called during repo activation (`activate_repo`, `activate_local_repo`). It:

1. Reads `schema_version` from `version.yml` or fallback `racks.yml`
2. If current < `CURRENT_SCHEMA_VERSION`, runs each migration in sequence
3. Writes updated `version.yml` after migrations

### Adding a migration

1. Implement `_migrate_to_N()` in `backend/ansible/migrations.py`:

```python
def _migrate_to_2(layout: AnsibleLayout) -> None:
    """Migrate from schema version 1 to 2."""
    # Example: rename a key, add a new file, restructure
    pass
```

2. Add it to the dispatch:

```python
MIGRATIONS = {2: _migrate_to_2}
```

3. Bump `CURRENT_SCHEMA_VERSION` in the same file.

4. Update `_run_migration()` to call `MIGRATIONS[version](layout)`.

5. Document the change in release notes.

### Breaking change rules

- **Additive changes** (new optional fields, new files): usually no migration needed; readers tolerate absence.
- **Removing or renaming fields**: require a migration that transforms old → new.
- **Changing structure** (e.g. `racks.yml` → `racks/` directory): migration must read old format and write new.

Always preserve user data. Prefer copying to new structure, then removing old in a later version if desired.

## Backend SQLite schema

### Version table

`_utils.db` creates a `schema_version` table with a single row `(version)`. Migration runner in `_utils.db_migrations` applies pending migrations and updates this value.

### Adding a DB migration

1. Add a function in `backend/_utils/db_migrations.py`:

```python
async def _migrate_to_2(db: aiosqlite.Connection) -> None:
    await db.execute("ALTER TABLE playbook_runs ADD COLUMN new_col TEXT")
```

2. Register in `MIGRATIONS` dict and bump the target version.

3. Run migrations: `init_db()` calls `run_migrations()` automatically on startup.

## Registry PostgreSQL schema

The registry uses Alembic. Migrations live in `registry/db/migrations/versions/`.

### Adding a migration

```bash
cd registry && uv run alembic revision -m "add_column_foo"
```

Edit the generated file, then:

```bash
uv run alembic upgrade head
```

Migrations run on registry startup in `main.py` lifespan.

## Upgrade flow for users

When a breaking change is released:

1. **App upgrade**: User deploys new backend/frontend/registry images or binaries.
2. **Repo activation**: On next repo activate, `migrate_repo()` runs and upgrades `.racksmith/` files.
3. **DB**: Backend `init_db()` runs migrations on startup.
4. **Registry**: Registry runs Alembic on startup.

The frontend can detect an outdated app by comparing `GET /api/version` with its build-time version and showing an upgrade banner.

## Checklist for a breaking change

1. [ ] Decide which layer(s) are affected (YAML, SQLite, Registry).
2. [ ] Implement migration(s) and bump version constants.
3. [ ] Add tests for the migration (old → new round-trip).
4. [ ] Document in release notes what changed and what users must do.
5. [ ] Ensure `migrate_repo` is always called on repo activation (already the case).
6. [ ] If YAML schema: ensure old readers can still parse un-migrated files until migration runs (or document minimum version).
