"""Shared environment settings used by both API and daemon."""

from racksmith_shared.environ import env

__all__ = [
    "REDIS_URL", "REDIS_RUN_EVENTS_PREFIX", "REDIS_SESSION_PREFIX",
    "REDIS_SSH_HISTORY_PREFIX", "REDIS_PING_CACHE_PREFIX",
    "SSH_DISABLE_HOST_KEY_CHECK", "SSH_HISTORY_TTL", "SSH_HISTORY_LIMIT",
    "PING_CACHE_TTL", "ANSIBLE_EXTENSIONS", "ANSIBLE_IDLE_TIMEOUT",
    "LOG_LEVEL", "SILENCE_LOGGERS",
]

REDIS_URL: str = env.str("REDIS_URL", default="redis://localhost:6379")
REDIS_RUN_EVENTS_PREFIX: str = env.str("REDIS_RUN_EVENTS_PREFIX", default="racksmith:run:")
REDIS_SESSION_PREFIX: str = env.str("REDIS_SESSION_PREFIX", default="racksmith:session:")
REDIS_SSH_HISTORY_PREFIX: str = env.str("REDIS_SSH_HISTORY_PREFIX", default="racksmith:ssh_history")
REDIS_PING_CACHE_PREFIX: str = env.str("REDIS_PING_CACHE_PREFIX", default="racksmith:ping:")

SSH_DISABLE_HOST_KEY_CHECK: bool = env.bool("SSH_DISABLE_HOST_KEY_CHECK", default=True)
SSH_HISTORY_TTL: int = env.int("SSH_HISTORY_TTL", default=60 * 60 * 24 * 30)
SSH_HISTORY_LIMIT: int = env.int("SSH_HISTORY_LIMIT", default=100)
PING_CACHE_TTL: int = env.int("PING_CACHE_TTL", default=15)

ANSIBLE_EXTENSIONS: list[str] = env.list(
    "ANSIBLE_EXTENSIONS",
    default=["community.general", "ansible.posix"],
)
ANSIBLE_IDLE_TIMEOUT: int = env.int("ANSIBLE_IDLE_TIMEOUT", default=600)

LOG_LEVEL: str = env.str("LOG_LEVEL", default="INFO")

SILENCE_LOGGERS: list[str] = env.list(
    "SILENCE_LOGGERS",
    default=[
        "uvicorn",
        "uvicorn.access",
        "uvicorn.error",
        "fastapi",
        "httpx",
        "httpcore",
        "urllib3",
        "asyncio",
    ],
)
