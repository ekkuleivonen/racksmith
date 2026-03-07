"""Schema documentation router."""

from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import PlainTextResponse

from config_schema.docs import generate_docs

router = APIRouter()


@router.get("/docs", response_class=PlainTextResponse)
async def get_schema_docs():
    """Returns rendered markdown documentation for .racksmith/ YAML format."""
    return generate_docs()
