# Racksmith

Racksmith manages Ansible automation in Git repositories. All configuration lives under `.racksmith/` in your repo, making it easy to adopt and remove.

## Quick start

1. Clone and configure:

```bash
cp .env.example .env
# Edit .env: GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, APP_URL
```

2. Run with Docker:

```bash
docker compose up -d
```

3. Open the frontend (default http://localhost:3000), sign in with GitHub, and connect a repo.

## Documentation

- **[Deployment](docs/DEPLOYMENT.md)** — How to deploy backend, frontend, and registry
- **[Schema Versioning](docs/SCHEMA_VERSIONING.md)** — Schema versioning and handling breaking changes
- **API docs** — Swagger UI at `/docs` and ReDoc at `/redoc` when the backend is running

## Project layout

```
backend/         FastAPI app + Arq worker
frontend/        React SPA (Vite)
registry/        Role registry (FastAPI + PostgreSQL)
.racksmith/      Bundled Ansible actions and collections
```

## License

Proprietary.
