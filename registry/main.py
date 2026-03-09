"""Racksmith Registry – role registry API."""

from contextlib import asynccontextmanager

import settings
import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from roles.router import router as roles_router

logger = structlog.get_logger()


def _run_migrations():
    from alembic import command
    from alembic.config import Config

    cfg = Config("alembic.ini")
    command.upgrade(cfg, "head")


@asynccontextmanager
async def lifespan(app: FastAPI):
    from db.engine import engine

    _run_migrations()
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
