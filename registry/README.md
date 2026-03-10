# Racksmith Registry

Role registry API. Stores and serves Ansible roles with version compatibility.

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

See [docs/DEPLOYMENT.md](../docs/DEPLOYMENT.md). The registry needs `DATABASE_URL` and `ALLOWED_ORIGINS` (comma-separated) for CORS.
