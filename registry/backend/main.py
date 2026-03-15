"""Racksmith Registry – role registry API."""

import logging
import sys
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI

import settings

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
_root.setLevel(getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO))
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

from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from slowapi import _rate_limit_exceeded_handler  # noqa: E402
from slowapi.errors import RateLimitExceeded  # noqa: E402
from slowapi.middleware import SlowAPIMiddleware  # noqa: E402

from auth.router import router as auth_router  # noqa: E402
from playbooks.router import router as playbooks_router  # noqa: E402
from rate_limit import limiter  # noqa: E402
from roles.router import router as roles_router  # noqa: E402

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

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)  # type: ignore[arg-type]
app.add_middleware(SlowAPIMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS or [],
    allow_credentials=True,
    allow_methods=settings.CORS_ALLOW_METHODS,
    allow_headers=settings.CORS_ALLOW_HEADERS,
)

app.include_router(auth_router, tags=["auth"])
app.include_router(roles_router, tags=["roles"])
app.include_router(playbooks_router, tags=["playbooks"])


@app.get("/health")
async def health():
    from sqlalchemy import text

    from db.engine import async_session

    try:
        async with async_session() as session:
            await session.execute(text("SELECT 1"))
    except Exception:
        logger.warning("health_check_db_failed", exc_info=True)
        return {"status": "degraded", "db": "unreachable"}
    return {"status": "ok", "db": "connected"}


def main():
    import os

    import uvicorn

    reload = os.environ.get("UVICORN_RELOAD", "false").lower() in ("1", "true")
    port = int(os.environ.get("PORT", "8001"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=reload)


if __name__ == "__main__":
    main()
