from _utils.environ import env

# =============================================================================
# GitHub
# =============================================================================
GITHUB_CLIENT_ID: str = env.str("GITHUB_CLIENT_ID", required=True)
GITHUB_CLIENT_SECRET: str = env.str("GITHUB_CLIENT_SECRET", required=True)
GITHUB_OAUTH_SCOPES: str = env.str("GITHUB_OAUTH_SCOPES", default="repo read:user")

# =============================================================================
# App
# =============================================================================
APP_URL: str = env.str("APP_URL", default="http://localhost:5173")
REPOS_WORKSPACE: str = env.str("REPOS_WORKSPACE", default="./workspace")

# =============================================================================
# Database
# =============================================================================
DB_PATH: str = env.str("DB_PATH", default="./data/racksmith.db")

# =============================================================================
# Redis (session store)
# =============================================================================
REDIS_URL: str = env.str("REDIS_URL", default="redis://localhost:6379")

# =============================================================================
# Session
# =============================================================================
SESSION_COOKIE_NAME: str = env.str("SESSION_COOKIE_NAME", default="racksmith_session")
SESSION_MAX_AGE: int = env.int("SESSION_MAX_AGE", default=86400)  # 24h

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
# Logging
# =============================================================================

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
