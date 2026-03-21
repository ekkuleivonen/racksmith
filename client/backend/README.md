# Racksmith client API (`racksmith-client`)

FastAPI application for the homelab **client**. It owns the **Git workspace**, user sessions (via registry OAuth), inventory/playbook/role CRUD, and **enqueueing** Arq jobs. It does **not** run Ansible or SSH directly — that happens on the [**daemon**](../daemon/README.md).

Depends on [**racksmith-shared**](../shared/README.md) (path dependency).

## What runs here vs on the daemon

| Here (API) | Daemon |
|------------|--------|
| Read/write repo under `REPOS_WORKSPACE` | Executes `ansible-playbook` from serialized payloads |
| `POST` run → serialize layout → Arq job | Arq worker: `execute_playbook_run`, `execute_role_run`, `execute_network_scan` |
| Proxy WebSocket terminal, ping, keys, probes | Actual SSH / ping / arp-scan / key files on disk |

## Development

Requires **Redis** and a running **daemon** (HTTP + worker) if you exercise SSH/Ansible/discovery.

```bash
cd client/backend
uv sync
uv run uvicorn main:app --reload --port 8000
```

Configure `.env` (or parent repo `.env`) with at least:

- `REDIS_URL`
- `DAEMON_URL` (e.g. `http://127.0.0.1:8001`)
- `DAEMON_SECRET` (must match daemon when set)
- `APP_URL`, `REGISTRY_URL`, etc.

**Daemon** (separate terminals from [`client/daemon`](../daemon/README.md); the Arq worker lives there only):

```bash
cd ../daemon   # from repo: client/daemon
uv sync
uv run uvicorn main:app --reload --host 0.0.0.0 --port 8001
uv run python run_worker.py worker.settings.WorkerSettings
```

## API documentation

- Swagger UI: http://localhost:8000/docs  
- ReDoc: http://localhost:8000/redoc  
- Schema docs: http://localhost:8000/api/schema/docs  

Behind the split-stack frontend, these are under `/api/...` on port 8080 only if you expose the API directly; normally you use the same paths via the nginx proxy.

## Deployment

See [Client stack](../README.md) and [root Deployment / README](../../README.md).

## License

[GNU Affero General Public License v3.0](../../LICENSE) (project metadata: `license.file` → repo `LICENSE`, SPDX **AGPL-3.0**).
