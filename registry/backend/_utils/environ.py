"""Typed environment variable accessor (mirrors client backend's _utils/environ.py)."""

import builtins
import os
from typing import overload

TRUTHY = {"true", "1", "yes", "y", "on"}
FALSY = {"false", "0", "no", "n", "off"}


class Env:
    """Typed environment variable accessor.

    Method names intentionally match builtin type names for a clean
    ``env.str(...)``, ``env.int(...)`` API.  The ``builtins.*`` references
    in type annotations prevent mypy from resolving them as the methods.
    """

    @overload
    def str(self, key: builtins.str, *, default: builtins.str) -> builtins.str: ...
    @overload
    def str(self, key: builtins.str, *, required: builtins.bool = False) -> builtins.str | None: ...

    def str(
        self,
        key: builtins.str,
        *,
        default: builtins.str | None = None,
        required: builtins.bool = False,
    ) -> builtins.str | None:
        val = os.getenv(key)
        if val is not None:
            return val
        if required:
            raise ValueError(f"Required env var {key} is not set")
        return default

    @overload
    def int(self, key: builtins.str, *, default: builtins.int) -> builtins.int: ...
    @overload
    def int(self, key: builtins.str, *, required: builtins.bool = False) -> builtins.int | None: ...

    def int(
        self,
        key: builtins.str,
        *,
        default: builtins.int | None = None,
        required: builtins.bool = False,
    ) -> builtins.int | None:
        raw = os.getenv(key)
        if raw is None:
            if required:
                raise ValueError(f"Required env var {key} is not set")
            return default
        try:
            return builtins.int(raw.strip())
        except ValueError:
            raise ValueError(f"Env var {key}={raw!r} is not a valid integer")

    @overload
    def bool(self, key: builtins.str, *, default: builtins.bool) -> builtins.bool: ...
    @overload
    def bool(self, key: builtins.str, *, required: builtins.bool = False) -> builtins.bool | None: ...

    def bool(
        self,
        key: builtins.str,
        *,
        default: builtins.bool | None = None,
        required: builtins.bool = False,
    ) -> builtins.bool | None:
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
    def list(self, key: builtins.str, *, default: builtins.list[builtins.str]) -> builtins.list[builtins.str]: ...
    @overload
    def list(self, key: builtins.str, *, required: builtins.bool = False) -> builtins.list[builtins.str] | None: ...

    def list(
        self,
        key: builtins.str,
        *,
        default: builtins.list[builtins.str] | None = None,
        required: builtins.bool = False,
    ) -> builtins.list[builtins.str] | None:
        raw = os.getenv(key)
        if raw is None:
            if required:
                raise ValueError(f"Required env var {key} is not set")
            return default
        return [item.strip() for item in raw.split(",") if item.strip()]


env = Env()
