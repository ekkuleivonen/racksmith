# Racksmith — developer guide

Racksmith manages Ansible automation in Git repositories. Configuration lives under `.racksmith/` in each repo.

- **Client (homelab):** API + daemon + frontend + Redis — see [client/README.md](client/README.md).
- **Registry (cloud):** OAuth + role catalog API + PostgreSQL.

## Quick start (local)

1. Configure env:

```bash
cp .env.example .env
# APP_URL, REGISTRY_URL, DAEMON_SECRET (for split stack)
```

2. Run the client stack:

```bash
docker compose -f docker-compose.client.yml up -d
```

3. Open the UI (`APP_URL`, often `http://localhost:8080`), sign in with GitHub, connect a repo.

For **full local dev without Compose**, run Redis, then API, daemon HTTP, daemon worker, and frontend — see package READMEs below.

## Project layout

```
client/
  shared/        racksmith-shared — Redis, logging, schemas, shared env keys  → [README](client/shared/README.md)
  backend/       FastAPI API (workspace, enqueue jobs, proxy to daemon)      → [README](client/backend/README.md)
  daemon/        SSH, Ansible, scans, Arq worker                              → [README](client/daemon/README.md)
  frontend/      React (Vite) SPA                                             → [README](client/frontend/README.md)
  Dockerfile.api / Dockerfile.daemon / Dockerfile.frontend

registry/
  backend/       Registry API                                                 → [README](registry/backend/README.md)
  frontend/      Registry UI (planned)                                        → [README](registry/frontend/README.md)
```

## Deployment architecture

### Client (split)

```
┌─────────────────────────────────────────────────────────────────┐
│  Homelab / LAN                                                   │
│                                                                  │
│  ┌──────────┐   /api/*    ┌─────────┐   Redis    ┌────────────┐ │
│  │ Frontend │ ──────────► │   API   │ ◄────────► │   Redis    │ │
│  │ (nginx)  │             │(FastAPI)│            │            │ │
│  └──────────┘             └────┬────┘            └──────▲─────┘ │
│                                │ HTTP/WS                │       │
│                                ▼                        │       │
│                         ┌─────────────┐                 │       │
│                         │   Daemon    │ ────────────────┘       │
│                         │ uvicorn+arq │  (Arq consumer)         │
│                         │ host net L2 │                        │
│                         └──────┬──────┘                        │
│                                │ SSH, Ansible, arp-scan        │
│                                ▼                                │
│                          Target hosts                           │
└─────────────────────────────────────────────────────────────────┘
                                │
                                │ HTTPS (registry OAuth / catalog)
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│  Registry (cloud)          PostgreSQL                            │
└─────────────────────────────────────────────────────────────────┘
```

- **API** reads/writes the Git **workspace** and serializes inventory/playbooks/roles into **Arq** job arguments.
- **Daemon** materializes those payloads in a temp dir and runs `ansible-playbook`; **SSH keys** live only on the daemon (`DATA_DIR/.ssh`).
- **Shared state** between API and daemon is **Redis** (queue, run pub/sub, etc.) — not a shared filesystem for Ansible content.

**Prerequisites:** Docker Compose for the easy path; Git. Client users do **not** create their own GitHub OAuth app — the **registry** owns OAuth.

### Environment variables (cheat sheet)

| Client API | Client daemon | Registry |
|------------|---------------|----------|
| `APP_URL`, `REGISTRY_URL`, `DAEMON_URL`, `DAEMON_SECRET`, `REDIS_URL`, `REPOS_WORKSPACE` | `REDIS_URL`, `DATA_DIR`, `DAEMON_SECRET` | `GITHUB_*`, `TOKEN_ENCRYPTION_KEY`, `DATABASE_URL`, `REGISTRY_PUBLIC_URL` |

See `.env.example` and [README.md](README.md) for full lists.

### Docker Compose files

| File | Use |
|------|-----|
| `docker-compose.client.yml` | API + daemon + frontend + Redis + watchtower |
| `docker-compose.registry.yml` | Registry + Postgres (operator) |

**Both locally:**

```bash
docker compose -f docker-compose.registry.yml up -d
docker compose -f docker-compose.client.yml up -d
```

### CI (`build.yml`)

**Lint / test:** `client/backend`, `client/daemon` (Ruff + Mypy + pytest), `registry/backend`, `client/frontend` (tsc + ESLint). **Audits:** pip-audit (Python), npm audit (frontend).

**Images** (on push to `main`, after the above pass): per-platform builds merged to multi-arch:

- `racksmith-client-api`, `racksmith-client-daemon`, `racksmith-client-frontend`
- `racksmith-registry`, `racksmith-landing`

### OAuth flow (reminder)

1. GitHub OAuth App callback: `{REGISTRY_PUBLIC_URL}/auth/callback`
2. Registry env: `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `TOKEN_ENCRYPTION_KEY`
3. Fernet key: `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`

Login → client redirects to registry → GitHub → registry stores token → exchange back to client.

---

## Versioning and migrations

Two independent systems:

| Layer | What | Tool | Trigger |
|-------|------|------|---------|
| **Repo YAML** | `.racksmith/` in user repos | Python files in `client/backend/core/repo_migrations/` | Repo activate / sync |
| **Registry DB** | PostgreSQL | Alembic | Registry deploy |

### Repo migrations

Files in `client/backend/core/repo_migrations/v*.py` export `up(layout: AnsibleLayout) -> None`. The runner compares `.racksmith/.racksmith.yml` `schema_version` to available migrations.

### Registry DB

```bash
cd registry/backend
uv run alembic revision -m "message"
uv run alembic upgrade head
```

### Breaking changes

See `.cursor/rules/breaking-changes.mdc`.

---

## API docs

With the **API** running: Swagger `/docs`, ReDoc `/redoc`, schema `/api/schema/docs` (on the API port, e.g. 8000 behind frontend proxy as `/api/...`).

## License

[GNU Affero General Public License v3.0](LICENSE) (SPDX: **AGPL-3.0**).
