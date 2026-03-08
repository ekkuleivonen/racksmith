"""SSH business logic and command history."""

from __future__ import annotations

import asyncio
import json
from contextlib import suppress
from datetime import UTC, datetime

import asyncssh
from _utils.redis import Redis
from github.misc import user_storage_id
from nodes.managers import node_manager

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

    def _history_key(self, user_id: str, node_id: str) -> str:
        return f"{_HISTORY_PREFIX}:{user_id}:{node_id}"

    def _find_node(self, session, node_id: str):
        return node_manager.get_node(session, node_id)

    def _require_ssh_node(self, session, node_id: str):
        node = self._find_node(session, node_id)
        if not node.managed:
            raise ValueError("Node is not managed")
        if not node.ip_address or not node.ssh_user:
            raise ValueError("Node is missing IP address or ssh_user")
        return node

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

    def list_history(self, session, node_id: str) -> list[CommandHistoryEntry]:
        self._find_node(session, node_id)
        user_id = user_storage_id(session.user)
        return list(reversed(self._load_history(user_id, node_id)))

    def record_command(self, session, node_id: str, command: str) -> None:
        node = self._find_node(session, node_id)
        normalized = command.strip()
        if not normalized:
            return
        user_id = user_storage_id(session.user)
        history = self._load_history(user_id, node_id)
        history.append(
            CommandHistoryEntry(
                command=normalized,
                created_at=_now_iso(),
                node_id=node.id,
                node_name=node.name or node.hostname or node.ip_address,
                ip_address=node.ip_address,
            )
        )
        payload = json.dumps([entry.model_dump() for entry in history[-HISTORY_LIMIT:]])
        Redis.setex(self._history_key(user_id, node_id), HISTORY_TTL, payload)

    async def reboot_node(self, session, node_id: str) -> None:
        node = self._require_ssh_node(session, node_id)
        self.record_command(session, node_id, "sudo reboot")
        conn = await asyncssh.connect(
            **_connect_kwargs(node.ip_address, node.ssh_user, node.ssh_port)
        )
        try:
            try:
                process = await conn.create_process("sudo reboot", term_type="xterm")
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
                node = self._find_node(session, target.node_id)
            except KeyError:
                return PingStatusEntry(
                    node_id=target.node_id,
                    status="unknown",
                )

            if not node.managed:
                return PingStatusEntry(
                    node_id=target.node_id,
                    status="unknown",
                )

            host = (node.ip_address or "").strip()
            if not host:
                return PingStatusEntry(
                    node_id=target.node_id,
                    status="unknown",
                )

            task = host_checks.get(host)
            if task is None:
                task = asyncio.create_task(self._ping_host(host))
                host_checks[host] = task

            return PingStatusEntry(
                node_id=target.node_id,
                status="online" if await task else "offline",
            )

        return await asyncio.gather(*(check_target(target) for target in targets))

    async def proxy_terminal(self, session, node_id: str, websocket) -> None:
        node = self._require_ssh_node(session, node_id)
        conn = await asyncssh.connect(
            **_connect_kwargs(node.ip_address, node.ssh_user, node.ssh_port)
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
                        self.record_command(session, node_id, data.rstrip("\r\n"))
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
                    "ip_address": node.ip_address,
                    "ssh_user": node.ssh_user,
                    "ssh_port": node.ssh_port,
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
