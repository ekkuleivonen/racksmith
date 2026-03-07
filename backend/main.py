"""Racksmith FastAPI application."""

from contextlib import asynccontextmanager
from pathlib import Path

import settings
from _utils.logging import configure_logging, get_logger
from dotenv import load_dotenv
from actions.router import router as actions_router
from code.router import router as code_router
from fastapi import FastAPI
from groups.router import router as groups_router
from nodes.router import router as nodes_router
from schema.router import router as schema_router
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from github.router import auth_router
from stacks.router import router as stacks_router
from racks.router import router as racks_router
from repos.router import router as repos_router
from ssh.router import router as ssh_router

# Load .env from project root (parent of backend/) when present
load_dotenv(Path(__file__).resolve().parent.parent / ".env")
load_dotenv()  # Also load from cwd


@asynccontextmanager
async def lifespan(app: FastAPI):
    from _utils.db import close_db, init_db
    from arq import create_pool
    from arq.connections import RedisSettings
    from stacks.managers import stack_manager

    from actions.managers import action_manager

    configure_logging()
    await init_db()
    arq_pool = await create_pool(RedisSettings.from_dsn(settings.REDIS_URL))
    stack_manager.set_arq_pool(arq_pool)
    action_manager.set_arq_pool(arq_pool)
    try:
        yield
    finally:
        await arq_pool.close()
        await close_db()


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
app.include_router(actions_router, prefix="/api/actions", tags=["actions"])
app.include_router(repos_router, prefix="/api/repos", tags=["repos"])
app.include_router(racks_router, prefix="/api/racks", tags=["racks"])
app.include_router(nodes_router, prefix="/api/nodes", tags=["nodes"])
app.include_router(groups_router, prefix="/api/groups", tags=["groups"])
app.include_router(schema_router, prefix="/api/schema", tags=["schema"])
app.include_router(stacks_router, prefix="/api/stacks", tags=["stacks"])
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
