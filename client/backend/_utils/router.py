"""System endpoints: version, health checks."""

from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel

import settings
from _utils.logging import get_logger

logger = get_logger(__name__)

router = APIRouter()


class VersionResponse(BaseModel):
    version: str
    schema_version: int


class HealthResponse(BaseModel):
    status: str
    checks: dict[str, str]


class AppDefaultsResponse(BaseModel):
    ssh_port: int = 22
    rack_cols_by_width: dict[int, int] = {19: 12, 10: 6}


@router.get("/api/defaults", response_model=AppDefaultsResponse)
async def get_defaults() -> AppDefaultsResponse:
    """Return application defaults for the frontend."""
    return AppDefaultsResponse()


@router.get("/api/version", response_model=VersionResponse)
async def get_version() -> VersionResponse:
    """Return app and schema versions (unauthenticated)."""
    from core.migrations import current_schema_version

    return VersionResponse(
        version=settings.RACKSMITH_VERSION,
        schema_version=current_schema_version(),
    )


@router.get("/health")
async def health_check() -> JSONResponse:
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
    body = HealthResponse(
        status="healthy" if healthy else "degraded",
        checks=checks,
    ).model_dump(mode="json")
    return JSONResponse(status_code=status_code, content=body)
