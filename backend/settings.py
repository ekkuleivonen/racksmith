from _utils.environ import env

# =============================================================================
# GitHub
# =============================================================================
GITHUB_CLIENT_ID: str = env.str("GITHUB_CLIENT_ID", required=True)
GITHUB_CLIENT_SECRET: str = env.str("GITHUB_CLIENT_SECRET", required=True)
GITHUB_OAUTH_SCOPES: str = env.str("GITHUB_OAUTH_SCOPES", default="repo read:user")
GITHUB_API_BASE: str = env.str("GITHUB_API_BASE", default="https://api.github.com")
GITHUB_OAUTH_BASE: str = env.str("GITHUB_OAUTH_BASE", default="https://github.com")

# =============================================================================
# App
# =============================================================================
APP_URL: str = env.str("APP_URL", default="http://localhost:5173")
REPOS_WORKSPACE: str = env.str("REPOS_WORKSPACE", default="./workspace")
REGISTRY_URL: str = env.str("REGISTRY_URL", default="http://localhost:8001")
RACKSMITH_VERSION: str = env.str("RACKSMITH_VERSION", default="1.0.0")
OPENAI_API_KEY: str = env.str("OPENAI_API_KEY", default="")
OPENAI_MODEL: str = env.str("OPENAI_MODEL", default="gpt-4o-mini")

# =============================================================================
# Database
# =============================================================================
DB_PATH: str = env.str("DB_PATH", default="./data/racksmith.db")

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
SSH_HISTORY_TTL: int = env.int("SSH_HISTORY_TTL", default=60 * 60 * 24 * 30)  # 30 days
SSH_HISTORY_LIMIT: int = env.int("SSH_HISTORY_LIMIT", default=100)

# =============================================================================
# Git branch
# =============================================================================
GIT_RACKSMITH_BRANCH: str = env.str("GIT_RACKSMITH_BRANCH", default="racksmith")

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
# Ansible
# =============================================================================
ANSIBLE_COLLECTIONS_REQUIREMENTS: str = env.str(
    "ANSIBLE_COLLECTIONS_REQUIREMENTS",
    default="./.racksmith/collections/requirements.yml",
)

# =============================================================================
# OpenAI (role generation)
# =============================================================================
OPENAI_ROLE_GENERATE_RETRIES: int = env.int("OPENAI_ROLE_GENERATE_RETRIES", default=2)


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
