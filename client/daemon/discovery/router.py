"""Daemon discovery HTTP routes."""

from __future__ import annotations

import json

from fastapi import APIRouter, Depends
from racksmith_shared.redis import AsyncRedis

from auth import verify_daemon_token
from discovery.misc import detect_subnet
from discovery.schemas import DiscoveredDevice, ScanStatus

router = APIRouter()

SCAN_KEY_PREFIX = "racksmith:scan:"


@router.get("/subnet", dependencies=[Depends(verify_daemon_token)])
async def get_subnet():
    return {"subnet": detect_subnet()}


@router.get("/{scan_id}", response_model=ScanStatus, dependencies=[Depends(verify_daemon_token)])
async def get_scan(scan_id: str) -> ScanStatus:
    raw = await AsyncRedis.hgetall(f"{SCAN_KEY_PREFIX}{scan_id}")
    if not raw:
        return ScanStatus(scan_id=scan_id, status="not_found")

    devices: list[DiscoveredDevice] = []
    if raw.get("devices"):
        for d in json.loads(raw["devices"]):
            devices.append(DiscoveredDevice(**d))

    return ScanStatus(
        scan_id=raw.get("scan_id", scan_id),
        status=raw.get("status", "unknown"),
        devices=devices,
        subnet=raw.get("subnet", ""),
        error=raw.get("error") or None,
    )
