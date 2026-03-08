"""Node config schema for nodes/<id>.yaml."""

from __future__ import annotations

from pydantic import BaseModel, Field


class NodeConfig(BaseModel):
    """Schema for a single machine/node definition."""

    id: str = Field(description="Stable machine-generated identifier, matches filename stem")
    hostname: str = Field(default="", description="Device hostname from SSH probe")
    name: str = Field(default="", description="Display name for the node")
    ip_address: str = Field(default="", description="IP address for SSH/Ansible")
    ssh_user: str = Field(default="", description="SSH username")
    ssh_port: int = Field(default=22, description="SSH port")
    managed: bool = Field(default=True, description="Whether this node is managed (SSH, Ansible)")
    groups: list[str] = Field(default_factory=list, description="Group IDs this node belongs to")
    labels: list[str] = Field(default_factory=list, description="Arbitrary labels for targeting")
    os_family: str | None = Field(default=None, description="OS family (debian, ubuntu, etc.)")
    mac_address: str = Field(default="", description="Auto-discovered on SSH probe")
    notes: str = Field(default="", description="Free-form notes")
    rack: str | None = Field(default=None, description="Rack ID for visual placement")
    position_u_start: int | None = Field(default=None, description="Rack unit start (1-based)")
    position_u_height: int = Field(default=1, ge=1, description="Height in rack units")
    position_col_start: int = Field(default=0, ge=0, description="Column start (0-based)")
    position_col_count: int = Field(default=1, ge=1, description="Number of columns")
