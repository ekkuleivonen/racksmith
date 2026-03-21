"""SSH schemas for the daemon."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class SSHConnectRequest(BaseModel):
    ip: str
    ssh_user: str
    ssh_port: int = 22


class SSHProbeRequest(BaseModel):
    ip: str
    ssh_user: str
    ssh_port: int = 22


class SSHProbeResponse(BaseModel):
    ip_address: str
    name: str
    mac_address: str = ""
    os: str = ""
    labels: list[str] = []


class RebootRequest(BaseModel):
    ip: str
    ssh_user: str
    ssh_port: int = 22


class PingRequest(BaseModel):
    ips: list[str]


class PingEntry(BaseModel):
    ip: str
    status: Literal["online", "offline"]


class PingResponse(BaseModel):
    results: list[PingEntry]


class PublicKeyResponse(BaseModel):
    public_key: str


class CommandHistoryEntry(BaseModel):
    command: str
    created_at: str
    host_id: str
    host_name: str
    ip_address: str


class RecordCommandRequest(BaseModel):
    user_id: str
    host_id: str
    host_name: str
    ip_address: str
    command: str


class SSHExecRequest(BaseModel):
    ip: str
    ssh_user: str
    ssh_port: int = 22
    command: str = Field(default="", max_length=4096)
    timeout: float = Field(default=30.0, ge=1.0, le=120.0)


class SSHExecResponse(BaseModel):
    exit_code: int | None
    stdout: str = ""
    stderr: str = ""
