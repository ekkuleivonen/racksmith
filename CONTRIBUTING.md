# Contributing to Racksmith

Thanks for your interest in contributing! This guide covers how to set up the project locally, run checks, and submit changes.

## Project structure

```
client/
  backend/       FastAPI app + Arq worker (Python, UV)
  frontend/      React SPA (Vite, shadcn/ui)

registry/
  backend/       Role registry API (Python, UV, PostgreSQL)
```

## Prerequisites

- **Python 3.13+** (3.14 for the client backend)
- **[UV](https://docs.astral.sh/uv/)** — Python package manager
- **Node.js 22** (use `nvm use 22`)
- **Redis** (for the client backend worker)
- **PostgreSQL** (for the registry backend)
- **Docker & Docker Compose** (for running the full stack)

## Getting started

1. Clone the repo and copy the example env file:

```bash
git clone https://github.com/ekkuleivonen/racksmith.git
cd racksmith
cp .env.example .env
# Edit .env with your values
```

2. Set up each component you want to work on:

**Client backend:**

```bash
cd client/backend
uv sync
uv run uvicorn main:app --reload --port 8000
# In another terminal:
uv run python run_worker.py worker.settings.WorkerSettings
```

**Client frontend:**

```bash
cd client/frontend
npm install
npm run dev
```

Set `VITE_API_TARGET` if the API runs on a different host (default: `http://localhost:8000`).

**Registry backend:**

```bash
cd registry/backend
uv sync
uv run uvicorn main:app --reload --port 8001
```

Requires PostgreSQL. Set `DATABASE_URL` (default: `postgresql+asyncpg://registry:registry@localhost:5432/registry`).

## Linting and type checking

Run these before submitting a PR. CI enforces them.

**Client backend:**

```bash
cd client/backend
uv run ruff check .
uv run mypy .
```

**Registry backend:**

```bash
cd registry/backend
uv run ruff check .
uv run mypy .
```

**Client frontend:**

```bash
cd client/frontend
nvm use 22
npx tsc -b
npm run lint
```

## Running tests

```bash
cd client/backend
uv run python -m pytest -v
```

## Submitting changes

1. Fork the repo and create a feature branch from `main`.
2. Make your changes, keeping commits focused and descriptive.
3. Ensure all lint checks and tests pass.
4. Open a pull request against `main` with a clear description of what changed and why.

## Code style

- **Python**: Ruff for linting, mypy for type checking. Follow existing patterns in the codebase.
- **TypeScript/React**: ESLint with the project config. Use [shadcn/ui](https://ui.shadcn.com/) components for the frontend.
- Avoid adding comments that just narrate what code does — comments should explain *why*, not *what*.

## UI components

The frontend uses [shadcn/ui](https://ui.shadcn.com/). To add a new component:

```bash
cd client/frontend
npx shadcn@latest add <component_name>
```

## Questions?

Open a [discussion](https://github.com/ekkuleivonen/racksmith/discussions) or file an issue.
