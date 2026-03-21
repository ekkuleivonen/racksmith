"""Daemon-specific settings (extends shared settings_base)."""

from racksmith_shared.environ import env
from racksmith_shared.settings_base import (  # noqa: F401
    ANSIBLE_EXTENSIONS,
    ANSIBLE_IDLE_TIMEOUT,
    LOG_LEVEL,
    PING_CACHE_TTL,
    REDIS_PING_CACHE_PREFIX,
    REDIS_RUN_EVENTS_PREFIX,
    REDIS_SESSION_PREFIX,
    REDIS_SSH_HISTORY_PREFIX,
    REDIS_URL,
    SILENCE_LOGGERS,
    SSH_DISABLE_HOST_KEY_CHECK,
    SSH_HISTORY_LIMIT,
    SSH_HISTORY_TTL,
)

DATA_DIR: str = env.str("DATA_DIR", default="./data")
DAEMON_SECRET: str = env.str("DAEMON_SECRET", default="")
DAEMON_PORT: int = env.int("DAEMON_PORT", default=8001)
