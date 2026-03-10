import os

DATABASE_URL: str = os.environ.get(
    "DATABASE_URL",
    "postgresql+asyncpg://registry:registry@localhost:5432/registry",
)

ALLOWED_ORIGINS: list[str] = [
    o.strip()
    for o in os.environ.get("ALLOWED_ORIGINS", "").split(",")
    if o.strip()
]

# =============================================================================
# GitHub OAuth (registry owns the OAuth app)
# =============================================================================
GITHUB_CLIENT_ID: str = os.environ.get("GITHUB_CLIENT_ID", "")
GITHUB_CLIENT_SECRET: str = os.environ.get("GITHUB_CLIENT_SECRET", "")
GITHUB_OAUTH_SCOPES: str = os.environ.get("GITHUB_OAUTH_SCOPES", "repo read:user")
GITHUB_API_BASE: str = os.environ.get("GITHUB_API_BASE", "https://api.github.com")
GITHUB_OAUTH_BASE: str = os.environ.get("GITHUB_OAUTH_BASE", "https://github.com")

# =============================================================================
# Token encryption (Fernet key for encrypting GH tokens at rest)
# Generate with: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
# =============================================================================
TOKEN_ENCRYPTION_KEY: str = os.environ.get("TOKEN_ENCRYPTION_KEY", "")

# =============================================================================
# Registry public URL (used as OAuth redirect_uri base)
# =============================================================================
REGISTRY_PUBLIC_URL: str = os.environ.get("REGISTRY_PUBLIC_URL", "http://localhost:8001")
