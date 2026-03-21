# Racksmith Registry

Role registry API. Stores and serves Ansible roles and playbooks with version compatibility. List endpoints use a shared pagination envelope: `items`, `total`, `page`, `per_page`.

## Development

```bash
uv sync
```

Requires PostgreSQL. Set `DATABASE_URL` (default: `postgresql+asyncpg://registry:registry@localhost:5432/registry`).

```bash
uv run uvicorn main:app --reload --port 8001
```

Migrations run on startup.

## Deployment

See [README.dev.md](../../README.dev.md) and [README.md](../../README.md). The registry needs `DATABASE_URL` and `ALLOWED_ORIGINS` (comma-separated) for CORS.

## License

Same as the repository: [GNU Affero General Public License v3.0](../../LICENSE) (SPDX: **AGPL-3.0**).

