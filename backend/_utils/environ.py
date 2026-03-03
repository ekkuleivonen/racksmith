"""Environment variable utilities with typed accessors."""

from __future__ import annotations

import os
from typing import Optional, Sequence, overload

from dotenv import load_dotenv

TRUTHY = {"true", "1", "yes", "y", "on"}
FALSY = {"false", "0", "no", "n", "off"}


class Env:
    """Typed environment variable accessor."""

    def __init__(self, env_files: Optional[Sequence[str]] = None):
        if not env_files:
            load_dotenv()
        else:
            for env_file in env_files:
                load_dotenv(env_file)

    @overload
    def str(self, key: str, *, default: str) -> str: ...
    @overload
    def str(self, key: str, *, required: bool = False) -> Optional[str]: ...

    def str(
        self, key: str, *, default: Optional[str] = None, required: bool = False
    ) -> Optional[str]:
        """Get string env var. Returns default if not set."""
        val = os.getenv(key)
        if val is not None:
            return val
        if required:
            raise ValueError(f"Required env var {key} is not set")
        return default

    @overload
    def int(self, key: str, *, default: int) -> int: ...
    @overload
    def int(self, key: str, *, required: bool = False) -> Optional[int]: ...

    def int(
        self, key: str, *, default: Optional[int] = None, required: bool = False
    ) -> Optional[int]:
        """Get integer env var. Returns default if not set."""
        raw = os.getenv(key)
        if raw is None:
            if required:
                raise ValueError(f"Required env var {key} is not set")
            return default
        try:
            return int(raw.strip())
        except ValueError:
            raise ValueError(f"Env var {key}={raw!r} is not a valid integer")

    @overload
    def float(self, key: str, *, default: float) -> float: ...
    @overload
    def float(self, key: str, *, required: bool = False) -> Optional[float]: ...

    def float(
        self, key: str, *, default: Optional[float] = None, required: bool = False
    ) -> Optional[float]:
        """Get float env var. Returns default if not set."""
        raw = os.getenv(key)
        if raw is None:
            if required:
                raise ValueError(f"Required env var {key} is not set")
            return default
        try:
            return float(raw.strip())
        except ValueError:
            raise ValueError(f"Env var {key}={raw!r} is not a valid float")

    @overload
    def bool(self, key: str, *, default: bool) -> bool: ...
    @overload
    def bool(self, key: str, *, required: bool = False) -> Optional[bool]: ...

    def bool(
        self, key: str, *, default: Optional[bool] = None, required: bool = False
    ) -> Optional[bool]:
        """Get boolean env var (true/1/yes/y/on or false/0/no/n/off)."""
        raw = os.getenv(key)
        if raw is None:
            if required:
                raise ValueError(f"Required env var {key} is not set")
            return default
        s = raw.strip().lower()
        if s in TRUTHY:
            return True
        if s in FALSY:
            return False
        raise ValueError(f"Env var {key}={raw!r} is not a valid boolean")

    @overload
    def list(self, key: str, *, default: list[str]) -> list[str]: ...
    @overload
    def list(self, key: str, *, required: bool = False) -> Optional[list[str]]: ...

    def list(
        self,
        key: str,
        *,
        default: Optional[list[str]] = None,
        required: bool = False,
    ) -> Optional[list[str]]:
        """Get comma-separated list env var."""
        raw = os.getenv(key)
        if raw is None:
            if required:
                raise ValueError(f"Required env var {key} is not set")
            return default
        return [item.strip() for item in raw.split(",") if item.strip()]

    def choice(
        self,
        key: str,
        choices: Sequence[str],
        *,
        default: Optional[str] = None,
        required: bool = False,
    ) -> Optional[str]:
        """Get env var that must be one of the given choices."""
        raw = os.getenv(key)
        if raw is None:
            if required:
                raise ValueError(f"Required env var {key} is not set")
            if default is not None and default not in choices:
                raise ValueError(
                    f"Default {default!r} not in choices {list[str](choices)}"
                )
            return default
        if raw not in choices:
            raise ValueError(
                f"Env var {key}={raw!r} must be one of {list[str](choices)}"
            )
        return raw


env = Env()