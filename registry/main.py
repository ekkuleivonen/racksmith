"""Racksmith Registry – role registry API."""

from contextlib import asynccontextmanager

import settings
import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from roles.router import router as roles_router

logger = structlog.get_logger()


async def _run_migrations():
    import subprocess
    import sys

    result = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        logger.error("alembic migration failed", stderr=result.stderr)
        raise RuntimeError(f"Alembic migration failed: {result.stderr}")
    logger.info("migrations applied")


@asynccontextmanager
async def lifespan(app: FastAPI):
    from db.engine import engine

    await _run_migrations()
    logger.info("registry starting")
    yield
    await engine.dispose()
    logger.info("registry stopped")


app = FastAPI(title="Racksmith Registry", lifespan=lifespan)

if settings.ALLOWED_ORIGINS:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.ALLOWED_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

app.include_router(roles_router, tags=["roles"])


def main():
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8001, reload=True)


if __name__ == "__main__":
    main()
