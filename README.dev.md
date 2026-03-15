# Racksmith

Racksmith manages Ansible automation in Git repositories. All configuration lives under `.racksmith/` in your repo, making it easy to adopt and remove.

The **client** runs locally (your machine / homelab) and the **registry** is the cloud-hosted service that all clients talk to.

## Quick start

1. Clone and configure:

```bash
cp .env.example .env
# Edit .env: APP_URL, REGISTRY_URL
```

2. Run the client with Docker:

```bash
docker compose -f docker-compose.client.yml up -d
```

3. Open the client (default http://localhost:8080), sign in with GitHub, and connect a repo.

## Project layout

```
client/
  backend/       FastAPI app + Arq worker (runs locally)  — [README](client/backend/README.md)
  frontend/      React SPA (Vite)                          — [README](client/frontend/README.md)

registry/
  backend/       Role registry API (cloud-hosted)           — [README](registry/backend/README.md)
  frontend/      Registry UI (planned)                     — [README](registry/frontend/README.md)

.racksmith/      Bundled Ansible actions and collections
```

---

## Deployment

### Architecture

Racksmith is split into two independently deployed parts:

- **Client** (runs locally / homelab): FastAPI backend, Arq worker, React frontend, embedded Redis — all bundled in a single Docker image
- **Registry** (cloud-hosted): Role registry API on port 8001, backed by PostgreSQL

```
┌─────────────────────────────┐        ┌──────────────────────────┐
│  Client (your machine)      │        │  Registry (cloud)        │
│  ┌─────────┐ ┌───────────┐ │        │  ┌──────────┐           │
│  │ Backend  │ │ Frontend  │ │  HTTP  │  │ Registry │           │
│  │ + Worker │ │  (React)  │ ├───────►│  │  (API)   │           │
│  └─────────┘ └───────────┘ │        │  └────┬─────┘           │
│  ┌─────────┐ ┌───────────┐ │        │       │                 │
│  │  Redis  │ │  SQLite   │ │        │  ┌────▼─────┐           │
│  └─────────┘ └───────────┘ │        │  │ Postgres │           │
└─────────────────────────────┘        │  └──────────┘           │
                                       └──────────────────────────┘
```

**Prerequisites:** Docker and Docker Compose, Git. Client users do NOT need a GitHub OAuth App — the registry handles OAuth centrally.

### Environment variables

| Client (users deploy locally) | Registry (cloud operator) |
|-------------------------------|---------------------------|
| `APP_URL` — URL where frontend is served | `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` |
| `REGISTRY_URL` — Registry API URL | `TOKEN_ENCRYPTION_KEY` — Fernet key |
| `REPOS_WORKSPACE`, `DATA_DIR`, `REDIS_URL`, `SESSION_MAX_AGE` | `REGISTRY_PUBLIC_URL`, `DATABASE_URL`, `REGISTRY_DB_PASSWORD` |

See `.env.example` for the full list.

### Docker Compose

**Client:**

```bash
docker compose -f docker-compose.client.yml up -d
```

Port 8080. Volumes: `./data`, `./workspace`. Watchtower auto-updates the image.

**Registry:**

```bash
docker compose -f docker-compose.registry.yml up -d
```

Port 8001. Uses PostgreSQL.

**Both (local dev):**

```bash
docker compose -f docker-compose.registry.yml up -d
docker compose -f docker-compose.client.yml up -d
```

Or run without Docker: see [client/backend/README.md](client/backend/README.md) and [registry/backend/README.md](registry/backend/README.md).

### Single-container client

```bash
docker run -p 8080:8080 \
  -e APP_URL=http://localhost:8080 \
  -e REGISTRY_URL=https://registry.racksmith.io \
  -v ./data:/app/data -v ./workspace:/app/workspace \
  ghcr.io/ekkuleivonen/racksmith-client:latest
```

### OAuth setup

1. Create a GitHub OAuth App (Settings → Developer settings → OAuth Apps)
2. Callback URL: `{REGISTRY_PUBLIC_URL}/auth/callback`
3. Set `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `TOKEN_ENCRYPTION_KEY` on the **registry** only
4. Generate Fernet key: `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`

**Auth flow:** Login → client redirects to registry `/auth/login` → GitHub OAuth → registry stores token → redirects back with exchange code → client gets token via `POST /auth/exchange`.

---

## Versioning and migrations

There are two independent migration systems. They serve different purposes and don't interact with each other.

| Layer | What it migrates | Tool | Trigger |
|-------|-----------------|------|---------|
| **Repo YAML** | `.racksmith/` files in user Git repos | Auto-discovered Python files | Repo activate / sync |
| **Registry DB** | PostgreSQL schema for the registry | Alembic | Registry deploy |

### Version numbers

| Concept | Where it lives | Purpose |
|---------|---------------|---------|
| **Repo schema version** | `.racksmith/.racksmith.yml` → `schema_version` | Tracks format of local YAML files |
| **Role/playbook version** | `role_versions.version_number` / `playbook_versions.version_number` | Auto-incrementing counter per role/playbook in the registry |

That's it. There is no compatibility matrix between these — they are unrelated.

### Repo migrations (local YAML)

Every user repo has a `schema_version` stamp in `.racksmith/.racksmith.yml`. When the client opens a repo, it compares that stamp to the highest migration file it ships:

```
repo schema_version (e.g. 3)  vs  current_schema_version() (e.g. 5)
                                   ↑ derived from migration files
```

If the repo is behind, each missing migration runs in order and the stamp is updated.

Migration files live in `client/backend/core/repo_migrations/` and are auto-discovered by filename:

```
repo_migrations/
  __init__.py
  v002_vars_to_native.py
  v003_cleanup.py
  v004_minimize_meta.py
```

Each file exports a single function:

```python
def up(layout: AnsibleLayout) -> None:
    """Transform repo files from schema N-1 to N."""
    ...
```

The runner finds all `v*.py` files, extracts the version number, and calls `up()` for any version the repo hasn't reached yet. Drop a file in the folder and it's picked up automatically.

### Registry DB migrations (Alembic)

Standard Alembic migrations for the registry PostgreSQL schema:

```bash
cd registry/backend
uv run alembic revision -m "add_some_column"
# edit the generated file
uv run alembic upgrade head
```

### How to handle breaking changes

See `.cursor/rules/breaking-changes.mdc` for the full playbook. The short version:

- **Local file format change** → add a repo migration file
- **Registry DB schema change** → add an Alembic migration
- **Registry role/playbook format change** → solve it at the point it happens with the simplest mechanism possible (e.g. `min_client_version` column). Don't build compatibility infrastructure in advance.

---

## API docs

When the backend is running: Swagger at `/docs`, ReDoc at `/redoc`, schema docs at `/api/schema/docs`.

## License

[AGPL-3.0](LICENSE)
