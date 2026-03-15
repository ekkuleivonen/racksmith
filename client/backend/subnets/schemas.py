"""Subnet request/response schemas."""

from __future__ import annotations

from pydantic import BaseModel, Field


class SubnetMeta(BaseModel):
    cidr: str
    name: str = ""
    description: str = ""


class SubnetUpdate(BaseModel):
    name: str = Field(default="", max_length=120)
    description: str = Field(default="", max_length=500)


class SubnetListResponse(BaseModel):
    subnets: list[SubnetMeta]


class SubnetResponse(BaseModel):
    subnet: SubnetMeta
