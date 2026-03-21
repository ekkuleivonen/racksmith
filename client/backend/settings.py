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

from _utils.environ import env


def _validate_required_settings() -> list[str]:
    """Return list of missing required env vars."""
    required = ["APP_URL"]
    import os
    return [k for k in required if not os.getenv(k)]


_missing = _validate_required_settings()
if _missing:
    import warnings
    warnings.warn(
        f"Required environment variables not set: {', '.join(_missing)}. "
        "Using defaults — this is fine for local dev but must be fixed in production.",
        stacklevel=2,
    )

# =============================================================================
# GitHub (no longer required — registry owns the OAuth app)
# =============================================================================
GITHUB_CLIENT_ID: str = env.str("GITHUB_CLIENT_ID", default="")
GITHUB_CLIENT_SECRET: str = env.str("GITHUB_CLIENT_SECRET", default="")
GITHUB_OAUTH_SCOPES: str = env.str("GITHUB_OAUTH_SCOPES", default="repo read:user")
GITHUB_API_BASE: str = env.str("GITHUB_API_BASE", default="https://api.github.com")
GITHUB_OAUTH_BASE: str = env.str("GITHUB_OAUTH_BASE", default="https://github.com")

# =============================================================================
# App
# =============================================================================
APP_URL: str = env.str("APP_URL", default="http://localhost:5173")
DATA_DIR: str = env.str("DATA_DIR", default="./data")
REPOS_WORKSPACE: str = env.str("REPOS_WORKSPACE", default="./workspace")
REGISTRY_URL: str = env.str("REGISTRY_URL", default="https://registry.racksmith.io")
RACKSMITH_VERSION: str = env.str("RACKSMITH_VERSION", default="dev")
OPENAI_API_KEY: str = env.str("OPENAI_API_KEY", default="")
OPENAI_MODEL: str = env.str("OPENAI_MODEL", default="gpt-4o-mini")
OPENAI_BASE_URL: str = env.str("OPENAI_BASE_URL", default="")

# =============================================================================
# Redis (API-only settings; shared ones come from settings_base)
# =============================================================================
REDIS_RACK_TOPIC: str = env.str("REDIS_RACK_TOPIC", default="racksmith-rack")
REDIS_REGISTRY_CACHE_PREFIX: str = env.str(
    "REDIS_REGISTRY_CACHE_PREFIX", default="racksmith:registry_cache:"
)
REGISTRY_CACHE_TTL: int = env.int("REGISTRY_CACHE_TTL", default=30)

# =============================================================================
# Git branch
# =============================================================================
GIT_RACKSMITH_BRANCH: str = env.str("GIT_RACKSMITH_BRANCH", default="racksmith")

# =============================================================================
# Session
# =============================================================================
SESSION_COOKIE_NAME: str = env.str("SESSION_COOKIE_NAME", default="racksmith_session")
SESSION_MAX_AGE: int = env.int("SESSION_MAX_AGE", default=604800)  # 7 days

# =============================================================================
# Git
# =============================================================================
GIT_COMMIT_USER_NAME: str = env.str("GIT_COMMIT_USER_NAME", default="Racksmith")
GIT_COMMIT_USER_EMAIL: str = env.str(
    "GIT_COMMIT_USER_EMAIL", default="racksmith@localhost"
)

# =============================================================================
# Daemon (daemon service URL and shared secret)
# =============================================================================
DAEMON_URL: str = env.str("DAEMON_URL", default="http://localhost:8001")
DAEMON_SECRET: str = env.str("DAEMON_SECRET", default="")

# =============================================================================
# OpenAI (role generation)
# =============================================================================
OPENAI_ROLE_GENERATE_RETRIES: int = env.int("OPENAI_ROLE_GENERATE_RETRIES", default=1)


# =============================================================================
# CORS
# =============================================================================
CORS_ALLOW_METHODS: list[str] = env.list("CORS_ALLOW_METHODS", default=["*"])
CORS_ALLOW_HEADERS: list[str] = env.list("CORS_ALLOW_HEADERS", default=["*"])
