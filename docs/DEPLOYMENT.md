# Racksmith Deployment

This document describes how to deploy the Racksmith backend, frontend, and registry.

## Architecture

Racksmith consists of:

- **Backend (app + worker)**: FastAPI app on port 8000, Arq worker for playbook/role runs
- **Frontend**: Static SPA (React/Vite) served by nginx on port 3000 (or 80 in Docker)
- **Registry**: Role registry API on port 8001, backed by PostgreSQL
- **Redis**: Session store and job queue
- **PostgreSQL**: Registry database only (backend uses SQLite)

## Prerequisites

- Docker and Docker Compose (for containerized deployment)
- Git
- GitHub OAuth App (create at [github.com/settings/developers](https://github.com/settings/developers))

## Environment Variables

Copy `.env.example` to `.env` and configure:

| Variable | Required | Description |
|----------|----------|-------------|
| `GITHUB_CLIENT_ID` | Yes | OAuth App Client ID |
| `GITHUB_CLIENT_SECRET` | Yes | OAuth App Client Secret |
| `APP_URL` | Yes | URL where frontend is served (e.g. `http://localhost:3000` for Docker, `http://localhost:5173` for dev) |
| `REPOS_WORKSPACE` | No | Path for cloned repos (default: `./workspace`) |
| `DB_PATH` | No | SQLite path for run history (default: `./data/racksmith.db`) |
| `REDIS_URL` | No | Redis connection (default: `redis://localhost:6379`) |
| `REGISTRY_URL` | No | Registry API URL (default: `http://localhost:8001`) |
| `REGISTRY_DB_PASSWORD` | Prod | PostgreSQL password for registry (required in docker-compose.prod) |
| `RACKSMITH_VERSION` | No | App version (default: `1.0.0`) |

See `.env.example` for the full list.

## Docker Compose Deployment

### Development

```bash
docker compose up -d
```

- App: http://localhost:8000
- Frontend: http://localhost:3000 (or configured port)
- Registry: http://localhost:8001
- Redis: localhost:6379
- Postgres (registry): localhost:5433

### Production

1. Create `.env` with `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `APP_URL`, `REGISTRY_DB_PASSWORD`
2. Set `APP_URL` to your public frontend URL (e.g. `https://racksmith.example.com`)
3. Optionally set `RACKSMITH_VERSION` for image tags

```bash
docker compose -f docker-compose.prod.yml up -d
```

Production images are pulled from `ghcr.io/ekkuleivonen/racksmith-*` (or your registry).

**Volumes** (create and persist):
- `./data` — SQLite DB and any backend data
- `./workspace` — cloned Git repos per user

## Single-container deployment

For quick start, homelab, or when you don't want docker-compose, use the all-in-one **racksmith-client** image. It bundles backend, worker, Redis, and frontend in one container.

**When to use:** LAN deployment, no external Redis/PostgreSQL needed. Registry and PostgreSQL stay external (host them in the cloud).

**Required env vars:**

| Variable | Description |
|----------|-------------|
| `GITHUB_CLIENT_ID` | OAuth App Client ID |
| `GITHUB_CLIENT_SECRET` | OAuth App Secret |
| `APP_URL` | URL where users reach the app (e.g. `http://192.168.1.10:8080`, `https://racksmith.example.com`) |
| `REGISTRY_URL` | Your cloud registry (e.g. `https://registry.racksmith.io`) |

**Example `docker run`:**

```bash
docker run -p 8080:8080 \
  -e GITHUB_CLIENT_ID=... \
  -e GITHUB_CLIENT_SECRET=... \
  -e APP_URL=http://localhost:8080 \
  -e REGISTRY_URL=https://registry.racksmith.io \
  -v ./data:/app/data \
  -v ./workspace:/app/workspace \
  ghcr.io/ekkuleivonen/racksmith-client:latest
```

**Example `docker compose` (use `docker-compose.client.yml`):**

```bash
docker compose -f docker-compose.client.yml up -d
```

**Volumes:**
- `./data` → `/app/data` (SQLite, backend data)
- `./workspace` → `/app/workspace` (cloned repos)

**Note:** The Registry is external and must be reachable from the container. The client uses SQLite (no PostgreSQL) and embedded Redis.

## Backend Deployment (standalone)

If not using Docker:

1. Install Python 3.14, Redis
2. `cd backend && uv sync`
3. Set env vars (see above)
4. Run app: `uv run uvicorn main:app --host 0.0.0.0 --port 8000`
5. Run worker: `uv run python run_worker.py worker.settings.WorkerSettings`

The worker must share `DB_PATH` and `REPOS_WORKSPACE` with the app.

## Frontend Deployment (standalone)

For development:

```bash
cd frontend && npm install && npm run dev
```

For production build:

```bash
cd frontend && npm run build
```

The `dist/` folder can be served by any static file server (nginx, Caddy, etc.). Ensure the server proxies `/api` and WebSocket paths to the backend.

## Registry Deployment (standalone)

1. Install PostgreSQL, create database and user
2. Set `DATABASE_URL` (e.g. `postgresql+asyncpg://user:pass@host/db`)
3. Run migrations: `cd registry && alembic upgrade head`
4. Run: `uv run uvicorn main:app --host 0.0.0.0 --port 8001`

Registry requires `ALLOWED_ORIGINS` (comma-separated) for CORS when the frontend/backend run on different origins.

## Health Checks

- **Backend**: `GET /api/version` returns 200 when the app is up
- **Registry**: No built-in health endpoint; consider adding `/health` or relying on port checks

## OAuth Setup

1. Create a GitHub OAuth App (Settings → Developer settings → OAuth Apps)
2. Set Authorization callback URL to `{APP_URL}/api/auth/callback` (e.g. `http://localhost:3000/api/auth/callback`)
3. Use the Client ID and Client Secret in `.env`
