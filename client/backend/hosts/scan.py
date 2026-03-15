"""Discovery business logic — start scans, read results, cross-reference hosts."""

from __future__ import annotations

import json
from ipaddress import IPv4Network

from _utils.helpers import new_id
from _utils.logging import get_logger
from _utils.redis import AsyncRedis
from auth.session import SessionData
from hosts.scan_misc import detect_subnet
from hosts.scan_schemas import DiscoveredDevice, ScanStatus

logger = get_logger(__name__)

SCAN_KEY_PREFIX = "racksmith:scan:"
SCAN_TTL = 600


def _scan_key(scan_id: str) -> str:
    return f"{SCAN_KEY_PREFIX}{scan_id}"


class ScanManager:
    def __init__(self) -> None:
        self._arq_pool = None

    def set_arq_pool(self, pool) -> None:
        self._arq_pool = pool

    async def start_scan(self, session: SessionData, subnet: str | None = None) -> str:
        resolved_subnet = subnet or detect_subnet()
        try:
            IPv4Network(resolved_subnet, strict=False)
        except ValueError:
            raise ValueError(f"Invalid subnet: {resolved_subnet}")
        scan_id = f"scan_{new_id()}"

        data = {
            "scan_id": scan_id,
            "status": "pending",
            "subnet": resolved_subnet,
            "devices": "[]",
            "error": "",
        }
        await AsyncRedis.hset_mapping(_scan_key(scan_id), data)
        await AsyncRedis.expire(_scan_key(scan_id), SCAN_TTL)

        if self._arq_pool is None:
            raise RuntimeError("arq pool not initialized")

        from repo.managers import repos_manager

        repo_path = str(repos_manager.active_repo_path(session))

        await self._arq_pool.enqueue_job(
            "execute_network_scan",
            scan_id=scan_id,
            subnet=resolved_subnet,
            repo_path=repo_path,
        )
        logger.info("scan_started", scan_id=scan_id, subnet=resolved_subnet)
        return scan_id

    async def get_scan(self, scan_id: str) -> ScanStatus:
        raw = await AsyncRedis.hgetall(_scan_key(scan_id))
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


scan_manager = ScanManager()
