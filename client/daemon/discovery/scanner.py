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
    """nmap -sn the subnet, enrich hostnames, cross-reference known_hosts (IP / MAC)."""
    redis = ctx["redis"]
    logger.info("network_scan_started", scan_id=scan_id, subnet=subnet)
    await _update_scan(redis, scan_id, {"status": "running"})

    try:
        from discovery.misc import nmap_scan, reverse_dns

        loop = asyncio.get_running_loop()
        raw_devices = await loop.run_in_executor(None, nmap_scan, subnet)

        if not raw_devices:
            await _update_scan(redis, scan_id, {"status": "completed", "devices": "[]"})
            logger.info("network_scan_completed", scan_id=scan_id, found=0)
            return

        devices: list[dict[str, Any]] = [
            {"ip": ip, "mac": "", "hostname": hostname} for ip, hostname in raw_devices
        ]
        await _update_scan(redis, scan_id, {"devices": json.dumps(devices)})

        async def _rdns(ip: str) -> str:
            return await loop.run_in_executor(None, reverse_dns, ip)

        need_rdns = [d["ip"] for d in devices if not d["hostname"]]
        if need_rdns:
            hostnames = await asyncio.gather(*[_rdns(ip) for ip in need_rdns])
            rdns_by_ip = dict(zip(need_rdns, hostnames, strict=True))
            for d in devices:
                if not d["hostname"]:
                    d["hostname"] = rdns_by_ip.get(d["ip"], "")

        await _update_scan(redis, scan_id, {"devices": json.dumps(devices)})

        mac_map: dict[str, str] = {}
        ip_map: dict[str, str] = {}
        for kh in known_hosts:
            if kh.get("mac"):
                mac_map[kh["mac"].lower()] = kh["host_id"]
            if kh.get("ip"):
                ip_map[kh["ip"]] = kh["host_id"]

        for d in devices:
            mac = (d.get("mac") or "").strip().lower()
            existing_id = ip_map.get(d["ip"]) or (mac_map.get(mac) if mac else None)
            if existing_id:
                d["already_imported"] = True
                d["existing_host_id"] = existing_id

        await _update_scan(redis, scan_id, {"status": "completed", "devices": json.dumps(devices)})
        logger.info("network_scan_completed", scan_id=scan_id, found=len(devices))

    except Exception as exc:
        logger.error("network_scan_failed", scan_id=scan_id, error=str(exc), exc_info=True)
        await _update_scan(redis, scan_id, {"status": "failed", "error": str(exc)})
