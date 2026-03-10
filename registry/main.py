"""Racksmith Registry – role registry API."""

import logging
import sys
from contextlib import asynccontextmanager

import settings
import structlog
from fastapi import FastAPI

# Structlog processor chain — matches the backend's _utils/logging.py for
# consistent JSON output across both services.
_shared_processors: list[structlog.types.Processor] = [
    structlog.stdlib.add_log_level,
    structlog.stdlib.add_logger_name,
    structlog.processors.TimeStamper(fmt="iso"),
    structlog.processors.StackInfoRenderer(),
    structlog.processors.format_exc_info,
    structlog.processors.UnicodeDecoder(),
]

_formatter = structlog.stdlib.ProcessorFormatter(
    foreign_pre_chain=_shared_processors,
    processors=[
        structlog.stdlib.ProcessorFormatter.remove_processors_meta,
        structlog.processors.JSONRenderer(),
    ],
)

_root = logging.getLogger()
_root.setLevel(logging.INFO)
_root.handlers.clear()
_handler = logging.StreamHandler(sys.stdout)
_handler.setFormatter(_formatter)
_root.addHandler(_handler)

structlog.configure(
    processors=_shared_processors + [
        structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
    ],
    context_class=dict,
    logger_factory=structlog.stdlib.LoggerFactory(),
    wrapper_class=structlog.stdlib.BoundLogger,
    cache_logger_on_first_use=True,
)

from fastapi.middleware.cors import CORSMiddleware
from auth.router import router as auth_router
from roles.router import router as roles_router

logger = structlog.get_logger(__name__)


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

app.include_router(auth_router, tags=["auth"])
app.include_router(roles_router, tags=["roles"])


def main():
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8001, reload=True)


if __name__ == "__main__":
    main()
