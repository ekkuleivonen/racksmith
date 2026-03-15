"""System endpoints: version, health checks."""

from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import JSONResponse

import settings
from _utils.logging import get_logger

logger = get_logger(__name__)

router = APIRouter()


@router.get("/api/version")
async def get_version():
    """Return app and schema versions (unauthenticated)."""
    from core.migrations import current_schema_version

    return {
        "version": settings.RACKSMITH_VERSION,
        "schema_version": current_schema_version(),
    }


@router.get("/health")
async def health_check():
    """Check Redis connectivity for monitoring."""
    checks: dict[str, str] = {}

    try:
        from _utils.redis import Redis as RedisUtil
        RedisUtil._get_client().ping()
        checks["redis"] = "ok"
    except Exception:
        logger.error("health_redis_failed", exc_info=True)
        checks["redis"] = "error"

    healthy = all(v == "ok" for v in checks.values())
    status_code = 200 if healthy else 503
    return JSONResponse(
        status_code=status_code,
        content={"status": "healthy" if healthy else "degraded", "checks": checks},
    )
