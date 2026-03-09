"""SSH business logic and command history."""

from __future__ import annotations

import asyncio
import json
from contextlib import suppress
from datetime import UTC, datetime

import asyncssh
from _utils.redis import Redis
from github.misc import RepoNotAvailableError, user_storage_id
from hosts.managers import host_manager

from ssh.misc import _connect_kwargs, generate_ssh_key_pair, machine_public_key
from ssh.schemas import CommandHistoryEntry, PingStatusEntry, PingStatusTarget

_HISTORY_PREFIX = "racksmith:ssh_history"
HISTORY_TTL = 60 * 60 * 24 * 30
HISTORY_LIMIT = 100


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


class SSHManager:
    def public_key(self, _session) -> str:
        return machine_public_key()

    def generate_key(self, _session) -> str:
        return generate_ssh_key_pair()

    def _history_key(self, user_id: str, host_id: str) -> str:
        return f"{_HISTORY_PREFIX}:{user_id}:{host_id}"

    def _find_host(self, session, host_id: str):
        return host_manager.get_host(session, host_id)

    def _require_ssh_host(self, session, host_id: str):
        host = self._find_host(session, host_id)
        if not host.managed:
            raise ValueError("Host is not managed")
        if not host.ip_address or not host.ssh_user:
            raise ValueError("Host is missing IP address or ssh_user")
        return host

    async def _ping_host(self, host: str) -> bool:
        process = await asyncio.create_subprocess_exec(
            "ping",
            "-c",
            "1",
            host,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        try:
            await asyncio.wait_for(process.wait(), timeout=2)
        except asyncio.TimeoutError:
            with suppress(ProcessLookupError):
                process.kill()
            with suppress(ProcessLookupError):
                await process.wait()
            return False
        return process.returncode == 0

    def _load_history(self, user_id: str, node_id: str) -> list[CommandHistoryEntry]:
        raw = Redis.get(self._history_key(user_id, node_id))
        if not raw:
            return []
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            return []
        return [CommandHistoryEntry.model_validate(entry) for entry in data]

    def list_history(self, session, host_id: str) -> list[CommandHistoryEntry]:
        self._find_host(session, host_id)
        user_id = user_storage_id(session.user)
        return list(reversed(self._load_history(user_id, host_id)))

    def record_command(self, session, host_id: str, command: str) -> None:
        host = self._find_host(session, host_id)
        normalized = command.strip()
        if not normalized:
            return
        user_id = user_storage_id(session.user)
        history = self._load_history(user_id, host_id)
        history.append(
            CommandHistoryEntry(
                command=normalized,
                created_at=_now_iso(),
                host_id=host.id,
                host_name=host.name or host.hostname or host.ip_address,
                ip_address=host.ip_address,
            )
        )
        payload = json.dumps([entry.model_dump() for entry in history[-HISTORY_LIMIT:]])
        Redis.setex(self._history_key(user_id, host_id), HISTORY_TTL, payload)

    async def reboot_node(self, session, host_id: str) -> None:
        host = self._require_ssh_host(session, host_id)
        self.record_command(session, host_id, "sudo reboot")
        conn = await asyncssh.connect(
            **_connect_kwargs(host.ip_address, host.ssh_user, host.ssh_port)
        )
        try:
            process = await conn.create_process("sudo reboot", term_type="xterm")
            try:
                await asyncio.wait_for(process.wait_closed(), timeout=2)
                if process.exit_status not in (0, None):
                    stderr = (await process.stderr.read()).strip()
                    raise RuntimeError(stderr or "Failed to reboot device")
            except asyncio.TimeoutError:
                return
            except (asyncssh.ConnectionLost, BrokenPipeError, OSError):
                return
        finally:
            conn.close()
            await conn.wait_closed()

    async def ping_statuses(
        self, session, targets: list[PingStatusTarget]
    ) -> list[PingStatusEntry]:
        host_checks: dict[str, asyncio.Task[bool]] = {}

        async def check_target(target: PingStatusTarget) -> PingStatusEntry:
            try:
                host = self._find_host(session, target.host_id)
            except (KeyError, RepoNotAvailableError):
                return PingStatusEntry(
                    host_id=target.host_id,
                    status="unknown",
                )

            if not host.managed:
                return PingStatusEntry(
                    host_id=target.host_id,
                    status="unknown",
                )

            ip_addr = (host.ip_address or "").strip()
            if not ip_addr:
                return PingStatusEntry(
                    host_id=target.host_id,
                    status="unknown",
                )

            task = host_checks.get(ip_addr)
            if task is None:
                task = asyncio.create_task(self._ping_host(ip_addr))
                host_checks[ip_addr] = task

            return PingStatusEntry(
                host_id=target.host_id,
                status="online" if await task else "offline",
            )

        return await asyncio.gather(*(check_target(target) for target in targets))

    async def proxy_terminal(self, session, host_id: str, websocket) -> None:
        host = self._require_ssh_host(session, host_id)
        conn = await asyncssh.connect(
            **_connect_kwargs(host.ip_address, host.ssh_user, host.ssh_port)
        )
        process = await conn.create_process(term_type="xterm")

        async def pump_stream(stream) -> None:
            while True:
                chunk = await stream.read(4096)
                if not chunk:
                    break
                await websocket.send_json({"type": "output", "data": chunk})

        async def pump_input() -> None:
            while True:
                message = await websocket.receive_json()
                event_type = str(message.get("type") or "")
                if event_type == "input":
                    data = str(message.get("data") or "")
                    if data.endswith("\n"):
                        self.record_command(session, host_id, data.rstrip("\r\n"))
                    process.stdin.write(data)
                elif event_type == "resize":
                    cols = int(message.get("cols") or 120)
                    rows = int(message.get("rows") or 30)
                    process.change_terminal_size(cols, rows)
                elif event_type == "close":
                    break

        tasks = [
            asyncio.create_task(pump_stream(process.stdout)),
            asyncio.create_task(pump_stream(process.stderr)),
            asyncio.create_task(pump_input()),
        ]
        try:
            await websocket.send_json(
                {
                    "type": "connected",
                    "ip_address": host.ip_address,
                    "ssh_user": host.ssh_user,
                    "ssh_port": host.ssh_port,
                }
            )
            done, pending = await asyncio.wait(
                tasks,
                return_when=asyncio.FIRST_COMPLETED,
            )
            for task in pending:
                task.cancel()
            for task in done:
                task.result()
        finally:
            process.close()
            conn.close()
            await conn.wait_closed()


ssh_manager = SSHManager()
