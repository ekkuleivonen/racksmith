"""Racksmith FastAPI application."""

import time
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from slowapi.util import get_remote_address

import settings
from _utils.exceptions import AlreadyExistsError, NotFoundError, RepoNotAvailableError
from _utils.logging import configure_logging, get_logger
from _utils.router import router as system_router
from auth.router import auth_router
from groups.router import router as groups_router
from hosts.router import hosts_router, scan_router, ssh_router
from onboarding.router import onboarding_router
from playbooks.router import router as playbooks_router
from racks.router import router as racks_router
from repo.router import files_router, repos_router
from roles.router import registry_router, roles_router
from settings_api.router import settings_router
from subnets.router import router as subnets_router

logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    from arq import create_pool
    from arq.connections import RedisSettings

    from core.migrations import migrate_all_active_repos
    from hosts.scan import scan_manager
    from playbooks.managers import playbook_manager
    from roles.managers import role_manager
    from settings_store import load_user_settings

    configure_logging(log_level=settings.LOG_LEVEL)
    load_user_settings()
    migrate_all_active_repos(racksmith_version=settings.RACKSMITH_VERSION)
    arq_pool = await create_pool(RedisSettings.from_dsn(settings.REDIS_URL))
    playbook_manager.set_arq_pool(arq_pool)
    role_manager.set_arq_pool(arq_pool)
    scan_manager.set_arq_pool(arq_pool)
    logger.info("app_starting")
    try:
        yield
    finally:
        logger.info("app_stopping")
        await arq_pool.close()


limiter = Limiter(key_func=get_remote_address, default_limits=["120/minute"])

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

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)  # type: ignore[arg-type]
app.add_middleware(SlowAPIMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.APP_URL],
    allow_credentials=True,
    allow_methods=settings.CORS_ALLOW_METHODS,
    allow_headers=settings.CORS_ALLOW_HEADERS,
)

static_dir = Path(__file__).resolve().parent / "_static"
if static_dir.exists():
    app.mount("/static", StaticFiles(directory=static_dir), name="static")


@app.middleware("http")
async def log_requests(request: Request, call_next):
    request_id = request.headers.get("x-request-id") or uuid.uuid4().hex[:16]
    start = time.monotonic()
    response = await call_next(request)
    duration_ms = (time.monotonic() - start) * 1000

    session_cookie = request.cookies.get(settings.SESSION_COOKIE_NAME)
    user_hint = session_cookie[:8] + "…" if session_cookie else None

    logger.info(
        "request_completed",
        request_id=request_id,
        method=request.method,
        path=request.url.path,
        status_code=response.status_code,
        duration_ms=round(duration_ms, 2),
        session=user_hint,
    )
    response.headers["x-request-id"] = request_id
    return response

app.include_router(system_router, tags=["system"])
app.include_router(auth_router, prefix="/api/auth", tags=["auth"])
app.include_router(roles_router, prefix="/api/roles", tags=["roles"])
app.include_router(repos_router, prefix="/api/repos", tags=["repos"])
app.include_router(racks_router, prefix="/api/racks", tags=["racks"])
app.include_router(hosts_router, prefix="/api/hosts", tags=["hosts"])
app.include_router(groups_router, prefix="/api/groups", tags=["groups"])
app.include_router(playbooks_router, prefix="/api/playbooks", tags=["playbooks"])
app.include_router(files_router, prefix="/api/files", tags=["files"])
app.include_router(ssh_router, prefix="/api/ssh", tags=["ssh"])
app.include_router(scan_router, prefix="/api/discovery", tags=["discovery"])
app.include_router(registry_router, prefix="/api/registry", tags=["registry"])
app.include_router(settings_router, prefix="/api/settings", tags=["settings"])
app.include_router(onboarding_router, prefix="/api/onboarding", tags=["onboarding"])
app.include_router(subnets_router, prefix="/api/subnets", tags=["subnets"])

_EXCEPTION_MAP: list[tuple[type[Exception], int]] = [
    (RepoNotAvailableError, 409),
    (NotFoundError, 404),
    (AlreadyExistsError, 409),
    (FileNotFoundError, 404),
    (KeyError, 400),
    (ValueError, 400),
]


def _make_handler(status: int):
    async def _handler(_request: Request, exc: Exception) -> JSONResponse:
        detail = f"Missing key: {exc}" if isinstance(exc, KeyError) else str(exc)
        return JSONResponse(status_code=status, content={"detail": detail})

    return _handler


for _exc_cls, _status in _EXCEPTION_MAP:
    app.add_exception_handler(_exc_cls, _make_handler(_status))


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
