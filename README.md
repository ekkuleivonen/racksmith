# Racksmith

[![CI](https://github.com/ekkuleivonen/racksmith/actions/workflows/build.yml/badge.svg)](https://github.com/ekkuleivonen/racksmith/actions/workflows/build.yml)

**Ansible automation for your homelab, managed through Git.**

Racksmith gives you a local web UI to build, run, and manage Ansible playbooks and roles across machines on your network. All configuration lives in a `.racksmith/` directory inside your own Git repo — nothing is hidden, nothing is locked in.

Connect your repo, point at your hosts, and let Racksmith handle the rest.

---

## Client — homelab stack (split services)

The **client** is no longer a single “all-in-one” container. It is **four services**: **Redis**, **API**, **daemon**, and **frontend**. Only the **daemon** needs raw LAN access (ARP scan, SSH to hosts, Ansible). The **API** holds the Git **workspace**; the daemon runs jobs from **serialized payloads** over Redis (no shared workspace volume).

Published images (multi-arch on `main` / tags):

| Image | Purpose |
|-------|---------|
| `ghcr.io/ekkuleivonen/racksmith-client-api` | FastAPI: workspace, auth proxy to registry, job enqueue, WebSocket proxy to daemon |
| `ghcr.io/ekkuleivonen/racksmith-client-daemon` | SSH, Ansible, ping, network scan, Arq worker; SSH keys on `/data/.ssh` |
| `ghcr.io/ekkuleivonen/racksmith-client-frontend` | nginx + built SPA; proxies `/api/*` to the API |

Shared Python package: **`racksmith-shared`** (path dependency in repo under `client/shared/`).

### Quick start (Docker Compose)

```bash
cp .env.example .env
# Set APP_URL, DAEMON_SECRET (and REGISTRY_URL if needed)

docker compose -f docker-compose.client.yml up -d
```

Compose enables **log rotation** on each service (`json-file`, 10 MB × 3 files) so logs don’t fill SD cards on homelab boards (e.g. Raspberry Pi). Adjust `x-logging` in `docker-compose.client.yml` if you need more history.

Open **`APP_URL`** (default in compose: `http://localhost:8080`), sign in with GitHub, and connect a repo.

### Architecture (high level)

```
Browser → frontend (nginx) → API (FastAPI)
                              ↓ Redis (Arq + pub/sub)
                              ↓ HTTP + WS (DAEMON_SECRET)
                           daemon (Ansible, SSH, arp-scan) → your LAN
```

- **Frontend** → only talks to the **API** (same origin `/api`).
- **API** → Redis for sessions/caches/runs; enqueues **Arq** jobs the **daemon** executes; calls the daemon for SSH probe, ping, keys, become validation, etc.
- **Daemon** → must reach **Redis**; uses **host networking** in the default compose so ARP scan works. SSH keys live on the **daemon** volume only (`daemon_data` → `/data`).

### Client API layout (FastAPI)

Rough namespaces under `/api/` (see Swagger on the API for the full list):

| Prefix | Purpose |
|--------|---------|
| `/api/auth` | GitHub OAuth via registry |
| `/api/hosts`, `/api/groups`, `/api/racks`, `/api/subnets` | Inventory and layout |
| `/api/roles`, `/api/playbooks` | Roles, playbooks, runs (runs enqueue work on the daemon) |
| `/api/files`, `/api/git` | Repo workspace and Git (commit, sync, diffs) |
| `/api/daemon` | Proxy to daemon: SSH terminal, ping, keys, discovery scans |
| `/api/registry` | Catalog proxy to the registry service |
| `/api/ai`, `/api/settings`, `/api/onboarding` | AI assist, user settings, setup |
| `/api/defaults` | Static app defaults for the SPA (SSH port, rack columns, …) |

### Volumes (compose defaults)

| Volume / mount | Service | Purpose |
|----------------|---------|---------|
| `workspace` | API | Cloned Git repos (`.racksmith/` layout) |
| `daemon_data` | Daemon | **SSH keys only** (`/data/.ssh`) — not the workspace |
| `redis_data` | Redis | Persistence (optional; depends on Redis config) |

### Required environment variables (client stack)

| Variable | Where | Description |
|----------|--------|-------------|
| `APP_URL` | API (+ browser) | Public URL of the UI (e.g. `http://192.168.1.50:8080`) |
| `DAEMON_SECRET` | API + Daemon | Shared bearer token for API → daemon calls |
| `REGISTRY_URL` | API | Registry API URL (default: `https://registry.racksmith.io`) |

### Important optional variables

| Variable | Default | Description |
|----------|---------|-------------|
| `REDIS_URL` | `redis://localhost:6379` | Must be consistent for API, daemon worker, and Arq |
| `DAEMON_URL` | `http://localhost:8001` | API base URL for the daemon (compose sets `http://daemon:8001`) |
| `DATA_DIR` | `./data` (daemon) | Daemon data directory; SSH keys under `.ssh/` |
| `REPOS_WORKSPACE` | `/app/workspace` (API) | Git workspace path inside API container |
| `OPENAI_API_KEY` | `""` | Enables AI-assisted role/playbook generation if set |
| `OPENAI_MODEL` | `gpt-4o-mini` | OpenAI model |
| `GIT_RACKSMITH_BRANCH` | `racksmith` | Branch Racksmith uses in your repo |
| `SSH_DISABLE_HOST_KEY_CHECK` | `true` | Ansible / SSH host key checking |
| `LOG_LEVEL` | `INFO` | Logging level |

> **Host networking on the daemon:** The default compose uses `network_mode: host` for the daemon so **arp-scan** sees real interfaces. The daemon’s `REDIS_URL` is `redis://127.0.0.1:6379` — you need Redis reachable on the host (e.g. publish port `6379` from the Redis container) or override `REDIS_URL` (e.g. host gateway / `host.docker.internal` where supported).

---

## Registry — `racksmith-registry`

The registry is the shared backend that handles GitHub OAuth and hosts a public catalog of reusable Ansible roles. The public instance at `registry.racksmith.io` is available for most users — self-host only if you need your own.

Self-hosting requires PostgreSQL. See [registry/backend/README.md](registry/backend/README.md).

### Required environment variables (registry)

| Variable | Description |
|----------|-------------|
| `TOKEN_ENCRYPTION_KEY` | Fernet encryption key for GitHub tokens |
| `GITHUB_CLIENT_ID` | GitHub OAuth App client ID |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth App client secret |
| `DATABASE_URL` | PostgreSQL connection string |
| `REGISTRY_PUBLIC_URL` | Public URL of the registry (OAuth callbacks) |

---

## License

Licensed under the **GNU Affero General Public License v3.0**. See [LICENSE](LICENSE) (SPDX: **AGPL-3.0**).
