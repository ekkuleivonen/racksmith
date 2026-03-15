from cryptography.fernet import Fernet

from _utils.environ import env

# =============================================================================
# Database
# =============================================================================
DATABASE_URL: str = env.str(
    "DATABASE_URL",
    default="postgresql+asyncpg://registry:registry@localhost:5432/registry",
)
if DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)

# =============================================================================
# GitHub OAuth (registry owns the OAuth app)
# =============================================================================
GITHUB_CLIENT_ID: str = env.str("GITHUB_CLIENT_ID", default="")
GITHUB_CLIENT_SECRET: str = env.str("GITHUB_CLIENT_SECRET", default="")
GITHUB_OAUTH_SCOPES: str = env.str("GITHUB_OAUTH_SCOPES", default="repo read:user")
GITHUB_API_BASE: str = env.str("GITHUB_API_BASE", default="https://api.github.com")
GITHUB_OAUTH_BASE: str = env.str("GITHUB_OAUTH_BASE", default="https://github.com")

# =============================================================================
# Token encryption (Fernet key for encrypting GH tokens at rest)
# Generate with: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
# =============================================================================
_raw_token_key = env.str("TOKEN_ENCRYPTION_KEY", required=True)
assert _raw_token_key is not None  # required=True guarantees this
try:
    Fernet(_raw_token_key.encode())
except Exception as exc:
    raise ValueError("TOKEN_ENCRYPTION_KEY is not a valid Fernet key") from exc
TOKEN_ENCRYPTION_KEY: str = _raw_token_key

# =============================================================================
# Registry public URL (used as OAuth redirect_uri base)
# =============================================================================
REGISTRY_PUBLIC_URL: str = env.str("REGISTRY_PUBLIC_URL", default="http://localhost:8001")

# =============================================================================
# CORS
# =============================================================================
ALLOWED_ORIGINS: list[str] = env.list("ALLOWED_ORIGINS", default=[])
CORS_ALLOW_METHODS: list[str] = env.list("CORS_ALLOW_METHODS", default=["*"])
CORS_ALLOW_HEADERS: list[str] = env.list("CORS_ALLOW_HEADERS", default=["*"])

# =============================================================================
# Logging
# =============================================================================
LOG_LEVEL: str = env.str("LOG_LEVEL", default="INFO")
