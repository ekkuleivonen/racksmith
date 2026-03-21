"""Network scan execution for the arq worker."""

from __future__ import annotations

import asyncio
import json
from typing import Any

from racksmith_shared.logging import get_logger

logger = get_logger(__name__)

SCAN_KEY_PREFIX = "racksmith:scan:"
SCAN_TTL = 600


async def _update_scan(redis, scan_id: str, fields: dict[str, str]) -> None:
    key = f"{SCAN_KEY_PREFIX}{scan_id}"
    await redis.hset(key, mapping=fields)
    await redis.expire(key, SCAN_TTL)


async def execute_network_scan(
    ctx,
    *,
    scan_id: str,
    subnet: str,
    known_hosts: list[dict[str, str]],
) -> None:
    """ARP-scan the subnet, enrich, cross-reference against known_hosts from payload."""
    redis = ctx["redis"]
    logger.info("network_scan_started", scan_id=scan_id, subnet=subnet)
    await _update_scan(redis, scan_id, {"status": "running"})

    try:
        from discovery.misc import arp_scan, lookup_vendors, reverse_dns

        loop = asyncio.get_running_loop()
        raw_devices = await loop.run_in_executor(None, arp_scan, subnet)

        if not raw_devices:
            await _update_scan(redis, scan_id, {"status": "completed", "devices": "[]"})
            logger.info("network_scan_completed", scan_id=scan_id, found=0)
            return

        devices: list[dict[str, Any]] = [{"ip": ip, "mac": mac} for ip, mac in raw_devices]
        await _update_scan(redis, scan_id, {"devices": json.dumps(devices)})

        macs = [mac for _, mac in raw_devices]
        vendors = await loop.run_in_executor(None, lookup_vendors, macs)
        for d in devices:
            d["vendor"] = vendors.get(d["mac"], "")

        async def _rdns(ip: str) -> str:
            return await loop.run_in_executor(None, reverse_dns, ip)

        hostnames = await asyncio.gather(*[_rdns(ip) for ip, _ in raw_devices])
        for d, hostname in zip(devices, hostnames):
            d["hostname"] = hostname

        await _update_scan(redis, scan_id, {"devices": json.dumps(devices)})

        mac_map: dict[str, str] = {}
        ip_map: dict[str, str] = {}
        for kh in known_hosts:
            if kh.get("mac"):
                mac_map[kh["mac"].lower()] = kh["host_id"]
            if kh.get("ip"):
                ip_map[kh["ip"]] = kh["host_id"]

        for d in devices:
            mac_lower = d["mac"].lower()
            existing_id = mac_map.get(mac_lower) or ip_map.get(d["ip"])
            if existing_id:
                d["already_imported"] = True
                d["existing_host_id"] = existing_id

        await _update_scan(redis, scan_id, {"status": "completed", "devices": json.dumps(devices)})
        logger.info("network_scan_completed", scan_id=scan_id, found=len(devices))

    except Exception as exc:
        logger.error("network_scan_failed", scan_id=scan_id, error=str(exc), exc_info=True)
        await _update_scan(redis, scan_id, {"status": "failed", "error": str(exc)})
