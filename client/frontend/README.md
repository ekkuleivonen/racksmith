# Racksmith UI

React SPA for the homelab client. Vite, TanStack Query, shadcn/ui. All API calls go to **`/api/*`** on the same origin in production (nginx in **`racksmith-client-frontend`** proxies to the **API** service).

## Development

```bash
npm install
npm run dev
```

`VITE_API_TARGET` (optional) — dev server proxy target for `/api` (default: `http://localhost:8000`). Point at your local API when the daemon is separate.

WebSockets (e.g. SSH terminal) are proxied like `/api/...` in dev; ensure the target API can reach the **daemon** for those routes.

## Build

```bash
npm run build
```

Output in `dist/`. The **frontend** Docker image copies `dist` into nginx and serves the SPA; **`/api/`** is reverse-proxied to the API container (see `client/nginx.frontend.conf`).

## Deployment shape

**Split stack:** Browser → frontend container (nginx) → API (`/api` proxy). No direct browser → daemon traffic; the API proxies WebSocket SSH and calls the daemon over HTTP with `DAEMON_SECRET`.

The old single-image `Dockerfile.client` layout has been removed — use `Dockerfile.api`, `Dockerfile.daemon`, and `Dockerfile.frontend` with [`docker-compose.client.yml`](../../docker-compose.client.yml).

## Deployment

See [Client stack](../README.md) and [root README](../../README.md).

## License

[GNU Affero General Public License v3.0](../../LICENSE) (SPDX: **AGPL-3.0**).
