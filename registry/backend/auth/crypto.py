"""Fernet-based encryption for GitHub access tokens stored at rest."""

from __future__ import annotations

from cryptography.fernet import Fernet, InvalidToken

import settings

_fernet: Fernet | None = None


def _get_fernet() -> Fernet:
    global _fernet
    if _fernet is None:
        key = settings.TOKEN_ENCRYPTION_KEY
        if not key:
            raise RuntimeError(
                "TOKEN_ENCRYPTION_KEY is not set. "
                "Generate one with: python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
            )
        _fernet = Fernet(key.encode())
    return _fernet


def encrypt_token(plaintext: str) -> str:
    """Encrypt a token and return a URL-safe base64 string."""
    if not plaintext:
        return ""
    return _get_fernet().encrypt(plaintext.encode()).decode()


def decrypt_token(ciphertext: str) -> str:
    """Decrypt a token. Returns empty string on invalid/empty input."""
    if not ciphertext:
        return ""
    try:
        return _get_fernet().decrypt(ciphertext.encode()).decode()
    except (InvalidToken, Exception):
        return ""
