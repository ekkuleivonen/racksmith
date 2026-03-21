"""Onboarding router — mark first-run wizard as complete."""

from __future__ import annotations

import shutil

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from _utils.logging import get_logger
from _utils.schemas import StatusMessageResponse
from auth.dependencies import CurrentSession
from auth.session import user_storage_id
from auth.workspace import (
    _onboarding_path,
    clear_active_repo,
    mark_onboarding_completed,
    user_workspace_path,
)
from settings_store import _settings_path, _write_file, load_user_settings

logger = get_logger(__name__)

onboarding_router = APIRouter()


@onboarding_router.post("/complete")
async def complete_onboarding(
    session: CurrentSession,
) -> JSONResponse:
    user_id = user_storage_id(session.user)
    mark_onboarding_completed(user_id)
    return JSONResponse(
        StatusMessageResponse(status="ok", message="Onboarding completed").model_dump(mode="json")
    )


@onboarding_router.post("/factory-reset")
async def factory_reset(
    session: CurrentSession,
) -> JSONResponse:
    """Wipe all user settings, local repos, and restart onboarding."""
    user_id = user_storage_id(session.user)

    # 1. Wipe user-settings.json and reload defaults
    settings_file = _settings_path()
    if settings_file.exists():
        _write_file({})
        load_user_settings()

    # 2. Clear active repo binding
    clear_active_repo(user_id)

    # 3. Drop all local repo clones for this user
    workspace = user_workspace_path(user_id)
    if workspace.is_dir():
        for entry in workspace.iterdir():
            if entry.is_dir() and not entry.name.startswith("."):
                shutil.rmtree(entry)
                logger.info("factory_reset_dropped_repo", path=str(entry.name), user_id=user_id)

    # 4. Reset onboarding flag
    onboarding_file = _onboarding_path(user_id)
    if onboarding_file.exists():
        onboarding_file.unlink()

    logger.info("factory_reset_complete", user_id=user_id)
    return JSONResponse(
        StatusMessageResponse(status="ok", message="Factory reset complete").model_dump(mode="json")
    )
