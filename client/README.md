# Racksmith client (homelab stack)

The homelab **client** is split into four cooperating pieces:

| Piece | Image / path | Role |
|-------|----------------|------|
| **API** | `racksmith-client-api` / `client/backend` | FastAPI: Git workspace, sessions, CRUD, enqueues Arq jobs with **serialized** Ansible payloads, proxies real-time SSH to the daemon |
| **Daemon** | `racksmith-client-daemon` / `client/daemon` | SSH, Ansible execution, ARP scan, ping; **Arq worker**; owns **SSH keys** under `$DATA_DIR/.ssh` |
| **Frontend** | `racksmith-client-frontend` / `client/frontend` | Static SPA; nginx proxies `/api/*` to the API |
| **Redis** | `redis:7-alpine` | Arq queue, pub/sub for run logs, sessions/caches as configured |

Shared code: [`client/shared`](shared/README.md) (`racksmith-shared`).

## Docker Compose

See [`../docker-compose.client.yml`](../docker-compose.client.yml). Required in `.env`:

- `APP_URL` — URL users open (e.g. `http://localhost:8080`)
- `DAEMON_SECRET` — same value on **api** and **daemon** (API uses it when calling the daemon)

The **daemon** uses `network_mode: host` so ARP scanning sees real interfaces. Its `REDIS_URL` defaults to `redis://127.0.0.1:6379` — ensure Redis is reachable from the host network (e.g. publish Redis port `6379` to the host or adjust `REDIS_URL`).

## Docs

- [Backend (API)](backend/README.md)
- [Daemon](daemon/README.md)
- [Shared library](shared/README.md)
- [Frontend](frontend/README.md)

## Production images

Dockerfiles run `uv sync --frozen --no-dev` at build time. The API and daemon **start** `uvicorn`/worker via `.venv/bin/...` (not `uv run`) so containers do not re-sync and pull **ruff**, **mypy**, etc. on every boot.

## License

[GNU Affero General Public License v3.0](../LICENSE) (SPDX: `AGPL-3.0`).
