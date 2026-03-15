# Racksmith Backend

FastAPI app and Arq worker for Racksmith.

## Development

```bash
uv sync
uv run uvicorn main:app --reload --port 8000
```

In another terminal for the worker:

```bash
uv run python run_worker.py worker.settings.WorkerSettings
```

Requires Redis. Copy `.env.example` to parent `.env` and configure.

## API Documentation

When running, visit:

- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc
- Schema docs: http://localhost:8000/api/schema/docs

## Deployment

See [Deployment](../../README.md#deployment) in the main README.
