"""Persistent user-configurable settings stored in DATA_DIR/user-settings.json.

Values here override the env-based defaults in the ``settings`` module.
The file is never committed to git — it lives on the Docker volume.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import settings
from _utils.logging import get_logger

logger = get_logger(__name__)

EDITABLE_KEYS: set[str] = {
    "OPENAI_API_KEY",
    "OPENAI_BASE_URL",
    "OPENAI_MODEL",
    "GIT_RACKSMITH_BRANCH",
    "REGISTRY_URL",
}

SENSITIVE_KEYS: set[str] = {"OPENAI_API_KEY"}
MASK_CHAR = "•"


def _settings_path() -> Path:
    return Path(settings.DATA_DIR) / "user-settings.json"


def _read_file() -> dict[str, str]:
    path = _settings_path()
    if not path.exists():
        return {}
    try:
        data = json.loads(path.read_text())
        if not isinstance(data, dict):
            return {}
        return {k: v for k, v in data.items() if isinstance(k, str) and isinstance(v, str)}
    except (json.JSONDecodeError, OSError) as exc:
        logger.warning("user_settings_read_error", error=str(exc))
        return {}


def _write_file(data: dict[str, str]) -> None:
    path = _settings_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2) + "\n")


def _patch_settings_module(data: dict[str, str]) -> None:
    for key, value in data.items():
        if key in EDITABLE_KEYS and hasattr(settings, key):
            setattr(settings, key, value)


def _mask_value(key: str, value: str) -> str:
    if key not in SENSITIVE_KEYS or not value:
        return value
    if len(value) <= 8:
        return "••••••••"
    return value[:3] + "•" * (len(value) - 7) + value[-4:]


def load_user_settings() -> None:
    """Called at startup to apply persisted overrides."""
    data = _read_file()
    if data:
        _patch_settings_module(data)
        logger.info("user_settings_loaded", keys=list(data.keys()))


def get_user_settings() -> dict[str, Any]:
    """Return current values of editable settings (sensitive ones masked)."""
    result: dict[str, Any] = {}
    for key in sorted(EDITABLE_KEYS):
        raw = getattr(settings, key, "")
        result[key] = _mask_value(key, raw)
    return result


def _is_masked(value: str) -> bool:
    return MASK_CHAR in value


def save_user_settings(updates: dict[str, str]) -> dict[str, Any]:
    """Persist and apply setting changes. Returns the new masked state."""
    filtered = {
        k: v
        for k, v in updates.items()
        if k in EDITABLE_KEYS and not (k in SENSITIVE_KEYS and _is_masked(v))
    }
    if not filtered:
        return get_user_settings()

    current = _read_file()
    current.update(filtered)
    _write_file(current)
    _patch_settings_module(filtered)
    logger.info("user_settings_saved", keys=list(filtered.keys()))
    return get_user_settings()
