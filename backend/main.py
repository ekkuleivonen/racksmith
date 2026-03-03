"""Racksmith FastAPI application."""

from pathlib import Path

from dotenv import load_dotenv

# Load .env from project root (parent of backend/) when present
load_dotenv(Path(__file__).resolve().parent.parent / ".env")
load_dotenv()  # Also load from cwd

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import settings
from _utils.logging import configure_logging, get_logger
from auth.router import router as auth_router
from repos.router import router as repos_router


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

app.include_router(auth_router, prefix="/api/auth", tags=["auth"])
app.include_router(repos_router, prefix="/api/repos", tags=["repos"])

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
