from _utils.environ import env



# =============================================================================
# GitHub
# =============================================================================

GITHUB_TOKEN: str = env.str("GITHUB_TOKEN", required=True)
GITHUB_OWNER: str = env.str("GITHUB_OWNER", required=True)
GITHUB_REPO: str = env.str("GITHUB_REPO", required=True)
GITHUB_DEFAULT_BRANCH: str = env.str("GITHUB_DEFAULT_BRANCH", default="main")


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