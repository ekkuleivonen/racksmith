# racksmith-shared

Shared Python library used by **racksmith-client** (API) and **racksmith-daemon**. It centralizes Redis helpers, logging, small schemas, run-state keys, and base environment settings (`REDIS_URL`, `LOG_LEVEL`, etc.) so both processes agree on wire formats and Redis key prefixes.

## Layout

| Module | Role |
|--------|------|
| `racksmith_shared/environ.py` | Typed `Env` helper for `.env` |
| `racksmith_shared/exceptions.py` | `NotFoundError`, `RepoNotAvailableError`, … |
| `racksmith_shared/helpers.py` | IDs, timestamps |
| `racksmith_shared/logging.py` | Structlog JSON setup |
| `racksmith_shared/redis.py` | Sync/async Redis wrappers |
| `racksmith_shared/schemas.py` | Shared Pydantic models (e.g. role input specs) |
| `racksmith_shared/runs.py` | Run keys in Redis, `run_events_channel()` for pub/sub log streams |
| `racksmith_shared/settings_base.py` | Env vars shared by API + daemon |

## Development

```bash
cd client/shared
uv sync
uv run ruff check .
uv run mypy racksmith_shared/
```

This package is a path dependency (`../shared`, editable) from `client/backend` and `client/daemon`.

## License

[GNU Affero General Public License v3.0](../../LICENSE) (SPDX: `AGPL-3.0`).
