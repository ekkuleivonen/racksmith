"""Racksmith FastAPI application."""

from contextlib import asynccontextmanager
from pathlib import Path

import settings
from _utils.logging import configure_logging, get_logger
from dotenv import load_dotenv
from code.router import router as code_router
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from github.router import auth_router
from playbooks.router import router as playbooks_router
from racks.router import router as racks_router
from setup.router import router as setup_router
from ssh.router import router as ssh_router

# Load .env from project root (parent of backend/) when present
load_dotenv(Path(__file__).resolve().parent.parent / ".env")
load_dotenv()  # Also load from cwd


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging()
    yield
    # cleanup if any


app = FastAPI(
    title="Racksmith",
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

app.include_router(auth_router, prefix="/api/auth", tags=["auth"])
app.include_router(setup_router, prefix="/api/setup", tags=["setup"])
app.include_router(racks_router, prefix="/api/racks", tags=["racks"])
app.include_router(playbooks_router, prefix="/api/playbooks", tags=["playbooks"])
app.include_router(code_router, prefix="/api/code", tags=["code"])
app.include_router(ssh_router, prefix="/api/ssh", tags=["ssh"])

logger = get_logger(__name__)


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
