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
REPOS_WORKSPACE: str = env.str("REPOS_WORKSPACE", default="./workspace")
REGISTRY_URL: str = env.str("REGISTRY_URL", default="https://registry.racksmith.io")
RACKSMITH_VERSION: str = env.str("RACKSMITH_VERSION", default="dev")
OPENAI_API_KEY: str = env.str("OPENAI_API_KEY", default="")
OPENAI_MODEL: str = env.str("OPENAI_MODEL", default="gpt-4o-mini")
OPENAI_BASE_URL: str = env.str("OPENAI_BASE_URL", default="")

# =============================================================================
# Data directory (SSH keys, etc.)
# =============================================================================
DATA_DIR: str = env.str("DATA_DIR", default="./data")

# =============================================================================
# Redis (session store, pub/sub, SSH history)
# =============================================================================
REDIS_URL: str = env.str("REDIS_URL", default="redis://localhost:6379")
REDIS_RUN_EVENTS_PREFIX: str = env.str(
    "REDIS_RUN_EVENTS_PREFIX", default="racksmith:run:"
)
REDIS_SESSION_PREFIX: str = env.str(
    "REDIS_SESSION_PREFIX", default="racksmith:session:"
)
REDIS_RACK_TOPIC: str = env.str("REDIS_RACK_TOPIC", default="racksmith-rack")
REDIS_SSH_HISTORY_PREFIX: str = env.str(
    "REDIS_SSH_HISTORY_PREFIX", default="racksmith:ssh_history"
)
REDIS_REGISTRY_CACHE_PREFIX: str = env.str(
    "REDIS_REGISTRY_CACHE_PREFIX", default="racksmith:registry_cache:"
)
REGISTRY_CACHE_TTL: int = env.int("REGISTRY_CACHE_TTL", default=900)
SSH_HISTORY_TTL: int = env.int("SSH_HISTORY_TTL", default=60 * 60 * 24 * 30)  # 30 days
SSH_HISTORY_LIMIT: int = env.int("SSH_HISTORY_LIMIT", default=100)
PING_CACHE_TTL: int = env.int("PING_CACHE_TTL", default=15)
REDIS_PING_CACHE_PREFIX: str = env.str(
    "REDIS_PING_CACHE_PREFIX", default="racksmith:ping:"
)

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
# SSH
# =============================================================================
SSH_DISABLE_HOST_KEY_CHECK: bool = env.bool("SSH_DISABLE_HOST_KEY_CHECK", default=True)

# =============================================================================
# Ansible
# =============================================================================
ANSIBLE_EXTENSIONS: list[str] = env.list(
    "ANSIBLE_EXTENSIONS",
    default=["community.general", "ansible.posix"],
)
ANSIBLE_IDLE_TIMEOUT: int = env.int("ANSIBLE_IDLE_TIMEOUT", default=600)  # 10 min

# =============================================================================
# OpenAI (role generation)
# =============================================================================
OPENAI_ROLE_GENERATE_RETRIES: int = env.int("OPENAI_ROLE_GENERATE_RETRIES", default=1)


# =============================================================================
# CORS
# =============================================================================
CORS_ALLOW_METHODS: list[str] = env.list("CORS_ALLOW_METHODS", default=["*"])
CORS_ALLOW_HEADERS: list[str] = env.list("CORS_ALLOW_HEADERS", default=["*"])

# =============================================================================
# Logging
# =============================================================================
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
