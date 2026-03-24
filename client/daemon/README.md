# racksmith-daemon

Runs on the **LAN side**: SSH (terminal, probe, reboot), ICMP ping, Ansible (`ansible-playbook`, become validation), ARP-based network scans, and the **Arq worker** that consumes jobs from Redis. It does **not** mount the Git workspace; job payloads carry serialized inventory/playbook/role content from the API.

## Components

- **HTTP** (`main.py`, port `DAEMON_PORT`, default `8001`): health, SSH helpers, discovery helpers, Ansible validation. Protected with `DAEMON_SECRET` (`Authorization: Bearer …`) when set.
- **WebSocket** `GET /ssh/connect`: interactive terminal; first message includes connection details + optional `token` matching `DAEMON_SECRET`.
- **Arq worker** (`worker/settings.py`): `execute_playbook_run`, `execute_role_run`, `execute_network_scan`.

## Development

Requires Redis. From repo root, typical local setup runs API + Redis separately; point the daemon at the same Redis.

```bash
cd client/daemon
uv sync
# Terminal 1
uv run uvicorn main:app --reload --host 0.0.0.0 --port 8001
# Terminal 2
uv run python run_worker.py worker.settings.WorkerSettings
```

Environment highlights:

| Variable | Purpose |
|----------|---------|
| `REDIS_URL` | Redis for Arq + pub/sub |
| `DATA_DIR` | Persistent dir; SSH keys live under `$DATA_DIR/.ssh/` |
| `DAEMON_SECRET` | Shared secret with the API (optional in dev, required in prod) |
| `DAEMON_PORT` | HTTP port (default `8001`) |

System tools expected in production images: `ansible-playbook`, `nmap`, `ping`, `openssh-client`.

## Tests

```bash
cd client/daemon
uv sync
uv run python -m pytest -v
```

## License

[GNU Affero General Public License v3.0](../../LICENSE) (SPDX: `AGPL-3.0`).
