# Racksmith

[![CI](https://github.com/ekkuleivonen/racksmith/actions/workflows/build.yml/badge.svg)](https://github.com/ekkuleivonen/racksmith/actions/workflows/build.yml)

**Ansible automation for your homelab, managed through Git.**

Racksmith gives you a local web UI to build, run, and manage Ansible playbooks and roles across every machine on your network. All configuration lives in a `.racksmith/` directory inside your own Git repo — nothing is hidden, nothing is locked in.

Connect your repo, point at your hosts, and let Racksmith handle the rest.

---

## Client — `racksmith-client`

The client is the image you run on your homelab. It bundles the API server, background worker, embedded Redis, and a React frontend into a single container.

### Quick start

```bash
docker run -d \
  --name racksmith \
  --network host \
  -e APP_URL=http://racksmith.local:8080 \
  -e REGISTRY_URL=https://registry.racksmith.io \
  -v racksmith-data:/app/data \
  -v racksmith-workspace:/app/workspace \
  ghcr.io/ekkuleivonen/racksmith-client:latest
```

Or with Docker Compose:

```yaml
services:
  racksmith:
    image: ghcr.io/ekkuleivonen/racksmith-client:latest
    network_mode: host
    environment:
      - APP_URL=http://racksmith.local:8080
      - REGISTRY_URL=https://registry.racksmith.io
    volumes:
      - racksmith-data:/app/data
      - racksmith-workspace:/app/workspace

volumes:
  racksmith-data:
  racksmith-workspace:
```

> **Why host networking?** Racksmith's network discovery uses ARP scanning to find devices on your LAN. Host networking lets the container see your real network interfaces. The UI is served on port 8080 directly on the host.

Open `http://<your-host>:8080`, sign in with GitHub, and connect a repo.

### Volumes

| Mount point | Purpose |
|---|---|
| `/app/data` | Persistent data — SSH keys, SQLite database, Redis state, sessions |
| `/app/workspace` | Locally cloned Git repos that Racksmith manages |

### Required environment variables

| Variable | Description |
|---|---|
| `APP_URL` | Public URL where you access the UI (e.g. `http://192.168.1.50:8080`) |
| `REGISTRY_URL` | Registry API URL (default: `https://registry.racksmith.io`) |

### Optional environment variables

| Variable | Default | Description |
|---|---|---|
| `OPENAI_API_KEY` | `""` | Enables AI-assisted role generation (disabled if empty) |
| `OPENAI_MODEL` | `gpt-4o-mini` | OpenAI model to use for generation |
| `REPOS_WORKSPACE` | `/app/workspace` | Override the workspace path inside the container |
| `DATA_DIR` | `/app/data` | Override the data path inside the container |
| `REDIS_URL` | `redis://127.0.0.1:6379` | Redis connection URL (embedded Redis runs by default) |
| `GIT_RACKSMITH_BRANCH` | `racksmith` | Branch name Racksmith uses in your repo |
| `GIT_COMMIT_USER_NAME` | `Racksmith` | Git commit author name |
| `GIT_COMMIT_USER_EMAIL` | `racksmith@localhost` | Git commit author email |
| `SESSION_MAX_AGE` | `604800` | Session lifetime in seconds (default 7 days) |
| `SSH_DISABLE_HOST_KEY_CHECK` | `true` | Disable strict host key checking for Ansible |
| `LOG_LEVEL` | `INFO` | Logging level |

---

## Registry — `racksmith-registry`

The registry is the shared backend that handles GitHub OAuth and hosts a public catalog of reusable Ansible roles. The public instance at `registry.racksmith.io` is available for everyone — most users will never need to self-host this.

If you do want to run your own registry, you'll need a PostgreSQL database.

### Required environment variables

| Variable | Description |
|---|---|
| `TOKEN_ENCRYPTION_KEY` | Fernet encryption key for storing GitHub tokens |
| `GITHUB_CLIENT_ID` | GitHub OAuth App client ID |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth App client secret |
| `DATABASE_URL` | PostgreSQL connection string |
| `REGISTRY_PUBLIC_URL` | Public URL of the registry (used for OAuth callbacks) |

### Optional environment variables

| Variable | Default | Description |
|---|---|---|
| `ALLOWED_ORIGINS` | `[]` | Comma-separated list of allowed CORS origins |
| `PORT` | `8001` | Port the registry listens on |
| `LOG_LEVEL` | `INFO` | Logging level |

---

## License

[AGPL-3.0](LICENSE)
