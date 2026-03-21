"""Racksmith daemon — FastAPI app for SSH, Ansible, and network operations."""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from racksmith_shared.logging import configure_logging, get_logger

import settings
from ansible.router import router as ansible_router
from discovery.router import router as discovery_router
from ssh.router import router as ssh_router

logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging(log_level=settings.LOG_LEVEL)
    logger.info("daemon_starting")
    try:
        yield
    finally:
        logger.info("daemon_stopping")


app = FastAPI(
    title="Racksmith Daemon",
    description="Internal daemon for SSH, Ansible, and network operations.",
    version="0.1.0",
    lifespan=lifespan,
)

app.include_router(ssh_router, prefix="/ssh", tags=["ssh"])
app.include_router(discovery_router, prefix="/discovery", tags=["discovery"])
app.include_router(ansible_router, prefix="/ansible", tags=["ansible"])


@app.get("/health")
async def health():
    return {"status": "ok"}


def main():
    import uvicorn

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=settings.DAEMON_PORT,
        reload=True,
    )


if __name__ == "__main__":
    main()
