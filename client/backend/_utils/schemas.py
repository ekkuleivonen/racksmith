"""Shared Pydantic schemas used across modules."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, model_validator


class RoleInputSpec(BaseModel):
    """Typed spec for role input parameters."""

    key: str = Field(min_length=1, max_length=80)
    label: str = ""
    description: str = ""
    type: Literal["string", "boolean", "secret", "str", "bool", "list", "dict"] = "string"
    placeholder: str = ""
    default: str | bool | int | list | dict | None = None
    required: bool = False
    options: list[str] = Field(default_factory=list)
    choices: list[str] = Field(default_factory=list)
    no_log: bool = False
    secret: bool = False

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
        if "racksmith_secret" in d and "secret" not in d:
            d["secret"] = d.pop("racksmith_secret", False)
        if "racksmith_interactive" in d and "secret" not in d:
            d["secret"] = d.pop("racksmith_interactive", False)
        if "interactive" in d and "secret" not in d:
            d["secret"] = d.pop("interactive", False)
        if "choices" in d and not d.get("options"):
            d.setdefault("options", d["choices"])
        for field in ("options", "choices"):
            if isinstance(d.get(field), list):
                d[field] = [
                    ("yes" if v else "no") if isinstance(v, bool) else str(v)
                    for v in d[field]
                ]
        return d


class PlatformSpec(BaseModel):
    """Typed spec for role platform compatibility."""

    name: str
    versions: list[str] = Field(default_factory=list)

    model_config = {"extra": "ignore"}


class RoleOutputSpec(BaseModel):
    """Declares a fact that a role produces via set_fact."""

    key: str = Field(min_length=1, max_length=80)
    description: str = ""
    type: Literal["string", "boolean", "list", "dict"] = "string"

    model_config = {"extra": "ignore"}


RunStatus = Literal["queued", "running", "completed", "failed"]

class StatusMessageResponse(BaseModel):
    status: str
    message: str = ""


__all__ = ["PlatformSpec", "RoleInputSpec", "RoleOutputSpec", "RunStatus", "StatusMessageResponse"]
