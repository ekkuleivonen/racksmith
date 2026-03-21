"""Subnet request/response schemas."""

from __future__ import annotations

from pydantic import BaseModel, Field


class SubnetMeta(BaseModel):
    cidr: str
    name: str = ""
    description: str = ""


class SubnetCreate(BaseModel):
    cidr: str = Field(min_length=3, max_length=64)
    name: str = Field(default="", max_length=120)
    description: str = Field(default="", max_length=500)


class SubnetPatch(BaseModel):
    name: str | None = Field(default=None, max_length=120)
    description: str | None = Field(default=None, max_length=500)


class SubnetResponse(BaseModel):
    subnet: SubnetMeta
