"""Shared Pydantic schemas used across modules."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, model_validator

RunStatus = Literal["queued", "running", "completed", "failed"]


class RoleInputSpec(BaseModel):
    """Typed spec for role input parameters (replaces dict/Any)."""

    key: str = Field(min_length=1, max_length=80)
    label: str = ""
    description: str = ""
    type: Literal["string", "boolean", "select", "secret", "str", "bool"] = "string"
    placeholder: str = ""
    default: str | bool | int | None = None
    required: bool = False
    options: list[str] = Field(default_factory=list)
    choices: list[str] = Field(default_factory=list)
    no_log: bool = False

    model_config = {"extra": "ignore"}

    @model_validator(mode="before")
    @classmethod
    def coerce_racksmith_keys(cls, data: object) -> object:
        if not isinstance(data, dict):
            return data
        d = dict(data)
        if "racksmith_label" in d and "label" not in d:
            d["label"] = d.pop("racksmith_label", "")
        if "racksmith_placeholder" in d and "placeholder" not in d:
            d["placeholder"] = d.pop("racksmith_placeholder", "")
        if "choices" in d and not d.get("options"):
            d.setdefault("options", d["choices"])
        return d


class PlatformSpec(BaseModel):
    """Typed spec for role platform compatibility."""

    name: str
    versions: list[str] = Field(default_factory=list)

    model_config = {"extra": "ignore"}
