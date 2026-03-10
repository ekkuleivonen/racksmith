"""Racksmith FastAPI application."""

import time
from contextlib import asynccontextmanager
from pathlib import Path

import settings
from _utils.logging import configure_logging, get_logger

logger = get_logger(__name__)
from dotenv import load_dotenv
from code.router import router as code_router
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from github.misc import RepoNotAvailableError
from fastapi.staticfiles import StaticFiles
from github.router import auth_router
from groups.router import router as groups_router
from hosts.router import router as hosts_router
from playbooks.router import router as playbooks_router
from racks.router import router as racks_router
from registry.router import router as registry_router
from repos.router import router as repos_router
from roles.router import router as roles_router
from schema.router import router as schema_router
from ssh.router import router as ssh_router

# Load .env from project root (parent of backend/) when present
load_dotenv(Path(__file__).resolve().parent.parent / ".env")
load_dotenv()  # Also load from cwd


@asynccontextmanager
async def lifespan(app: FastAPI):
    from _utils.db import close_db, init_db
    from arq import create_pool
    from arq.connections import RedisSettings

    from playbooks.managers import playbook_manager
    from roles.managers import role_manager

    configure_logging()
    await init_db()
    arq_pool = await create_pool(RedisSettings.from_dsn(settings.REDIS_URL))
    playbook_manager.set_arq_pool(arq_pool)
    role_manager.set_arq_pool(arq_pool)
    logger.info("app_starting")
    try:
        yield
    finally:
        logger.info("app_stopping")
        await arq_pool.close()
        await close_db()


app = FastAPI(
    title="Racksmith",
    description="""
Racksmith manages Ansible automation in Git repos. All configuration lives under `.racksmith/` in your repo.

**Auth**: GitHub OAuth. Most endpoints require an authenticated session.

**API docs**: Swagger UI (`/docs`) and ReDoc (`/redoc`) provide interactive documentation.
    """,
    version=settings.RACKSMITH_VERSION,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.APP_URL],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

static_dir = Path(__file__).resolve().parent / "_static"
if static_dir.exists():
    app.mount("/static", StaticFiles(directory=static_dir), name="static")


@app.middleware("http")
async def log_requests(request: Request, call_next):
    start = time.monotonic()
    response = await call_next(request)
    duration_ms = (time.monotonic() - start) * 1000
    logger.info(
        "request_completed",
        method=request.method,
        path=request.url.path,
        status_code=response.status_code,
        duration_ms=round(duration_ms, 2),
    )
    return response

@app.get("/api/version")
async def get_version():
    """Return app and schema versions (unauthenticated)."""
    from _utils.db import get_db_schema_version

    from ansible.migrations import CURRENT_SCHEMA_VERSION

    return {
        "version": settings.RACKSMITH_VERSION,
        "schema_version": CURRENT_SCHEMA_VERSION,
        "db_version": await get_db_schema_version(),
    }


@app.get("/health")
async def health_check():
    """Check Redis and DB connectivity for monitoring."""
    checks: dict[str, str] = {}

    # Redis
    try:
        from _utils.redis import Redis as RedisUtil
        RedisUtil._get_client().ping()
        checks["redis"] = "ok"
    except Exception as exc:
        checks["redis"] = f"error: {exc}"

    # SQLite
    try:
        from _utils.db import _get_db
        db = _get_db()
        async with db.execute("SELECT 1") as cursor:
            await cursor.fetchone()
        checks["db"] = "ok"
    except Exception as exc:
        checks["db"] = f"error: {exc}"

    healthy = all(v == "ok" for v in checks.values())
    status_code = 200 if healthy else 503
    return JSONResponse(
        status_code=status_code,
        content={"status": "healthy" if healthy else "degraded", "checks": checks},
    )


app.include_router(auth_router, prefix="/api/auth", tags=["auth"])
app.include_router(roles_router, prefix="/api/roles", tags=["roles"])
app.include_router(repos_router, prefix="/api/repos", tags=["repos"])
app.include_router(racks_router, prefix="/api/racks", tags=["racks"])
app.include_router(hosts_router, prefix="/api/hosts", tags=["hosts"])
app.include_router(groups_router, prefix="/api/groups", tags=["groups"])
app.include_router(schema_router, prefix="/api/schema", tags=["schema"])
app.include_router(playbooks_router, prefix="/api/playbooks", tags=["playbooks"])
app.include_router(code_router, prefix="/api/code", tags=["code"])
app.include_router(ssh_router, prefix="/api/ssh", tags=["ssh"])
app.include_router(registry_router, prefix="/api/registry", tags=["registry"])


@app.exception_handler(RepoNotAvailableError)
async def repo_not_available_handler(_request: Request, exc: RepoNotAvailableError):
    return JSONResponse(status_code=409, content={"detail": str(exc)})


def main():
    import uvicorn

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
    )


if __name__ == "__main__":
    main()
