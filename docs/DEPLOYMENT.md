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

Users deploying the Racksmith **client** do NOT need to create a GitHub OAuth App — the registry handles OAuth centrally.

## Environment Variables

### Client (backend + frontend) — what users deploy

| Variable | Required | Description |
|----------|----------|-------------|
| `APP_URL` | Yes | URL where frontend is served (e.g. `http://localhost:3000`) |
| `REGISTRY_URL` | Yes | Registry API URL (e.g. `https://registry.racksmith.io`) |
| `REPOS_WORKSPACE` | No | Path for cloned repos (default: `./workspace`) |
| `DB_PATH` | No | SQLite path (default: `./data/racksmith.db`) |
| `REDIS_URL` | No | Redis connection (default: `redis://localhost:6379`) |
| `SESSION_MAX_AGE` | No | Session lifetime in seconds (default: `604800` / 7 days) |

### Registry — what the operator deploys in the cloud

| Variable | Required | Description |
|----------|----------|-------------|
| `GITHUB_CLIENT_ID` | Yes | OAuth App Client ID |
| `GITHUB_CLIENT_SECRET` | Yes | OAuth App Client Secret |
| `TOKEN_ENCRYPTION_KEY` | Yes | Fernet key for encrypting GH tokens at rest |
| `REGISTRY_PUBLIC_URL` | Yes | Public URL of the registry (e.g. `https://registry.racksmith.io`) |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `REGISTRY_DB_PASSWORD` | Prod | PostgreSQL password (for docker-compose.prod) |

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

1. Create `.env` with `APP_URL`, `REGISTRY_URL`
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
| `APP_URL` | URL where users reach the app (e.g. `http://192.168.1.10:8080`) |
| `REGISTRY_URL` | Your cloud registry (e.g. `https://registry.racksmith.io`) |

**Example `docker run`:**

```bash
docker run -p 8080:8080 \
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
3. Set `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `TOKEN_ENCRYPTION_KEY`, `REGISTRY_PUBLIC_URL`
4. Run migrations: `cd registry && alembic upgrade head`
5. Run: `uv run uvicorn main:app --host 0.0.0.0 --port 8001`

Registry requires `ALLOWED_ORIGINS` (comma-separated) for CORS when the frontend/backend run on different origins.

## Health Checks

- **Backend**: `GET /api/version` returns 200 when the app is up
- **Registry**: No built-in health endpoint; consider adding `/health` or relying on port checks

## OAuth Setup

The **registry** owns the GitHub OAuth App. Client deployments do not need GH credentials.

1. Create a GitHub OAuth App (Settings → Developer settings → OAuth Apps)
2. Set Authorization callback URL to `{REGISTRY_PUBLIC_URL}/auth/callback` (e.g. `https://registry.racksmith.io/auth/callback`)
3. Set `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` on the **registry** (not on client)
4. Generate a Fernet key: `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`
5. Set `TOKEN_ENCRYPTION_KEY` on the registry

## Auth Flow

1. User clicks Login → client backend redirects to registry `/auth/login`
2. Registry redirects to GitHub OAuth
3. GitHub calls back to registry → registry exchanges code for GH token, encrypts and stores it
4. Registry generates a one-time exchange code, redirects back to client
5. Client backend exchanges code for GH token + user profile via `POST /auth/exchange`
6. Client stores token in local Redis session (7-day default lifetime)
7. When session nears expiry, client calls `POST /auth/refresh` to get a fresh token from registry
