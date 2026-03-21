"""Auth API response models."""

from __future__ import annotations

from pydantic import BaseModel


class UserInfo(BaseModel):
    id: int
    login: str = ""
    avatar_url: str = ""
    name: str | None = None
    email: str | None = None

    model_config = {"extra": "ignore"}


class UserResponse(BaseModel):
    user: UserInfo
