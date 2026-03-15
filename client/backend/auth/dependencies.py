"""Reusable FastAPI dependencies for auth."""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import Depends

from auth.managers import auth_manager
from auth.session import SessionData

CurrentSession = Annotated[SessionData, Depends(auth_manager.get_current_session)]
CurrentUser = Annotated[dict[str, Any], Depends(auth_manager.get_current_user)]
