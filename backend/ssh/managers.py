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

from ssh.misc import _connect_kwargs, machine_public_key
from ssh.schemas import CommandHistoryEntry, PingStatusEntry, PingStatusTarget

_HISTORY_PREFIX = "racksmith:ssh_history"
HISTORY_TTL = 60 * 60 * 24 * 30
HISTORY_LIMIT = 100


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


class SSHManager:
    def public_key(self, _session) -> str:
        return machine_public_key()

    def _history_key(self, user_id: str, node_slug: str) -> str:
        return f"{_HISTORY_PREFIX}:{user_id}:{node_slug}"

    def _find_node(self, session, node_slug: str):
        return node_manager.get_node(session, node_slug)

    def _require_ssh_node(self, session, node_slug: str):
        node = self._find_node(session, node_slug)
        if not node.managed:
            raise ValueError("Node is not managed")
        if not node.host or not node.ssh_user:
            raise ValueError("Node is missing host or ssh_user")
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

    def _load_history(self, user_id: str, node_slug: str) -> list[CommandHistoryEntry]:
        raw = Redis.get(self._history_key(user_id, node_slug))
        if not raw:
            return []
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            return []
        return [CommandHistoryEntry.model_validate(entry) for entry in data]

    def list_history(self, session, node_slug: str) -> list[CommandHistoryEntry]:
        self._find_node(session, node_slug)
        user_id = user_storage_id(session.user)
        return list(reversed(self._load_history(user_id, node_slug)))

    def record_command(self, session, node_slug: str, command: str) -> None:
        node = self._find_node(session, node_slug)
        normalized = command.strip()
        if not normalized:
            return
        user_id = user_storage_id(session.user)
        history = self._load_history(user_id, node_slug)
        history.append(
            CommandHistoryEntry(
                command=normalized,
                created_at=_now_iso(),
                node_slug=node.slug,
                node_name=node.name,
                host=node.host,
            )
        )
        payload = json.dumps([entry.model_dump() for entry in history[-HISTORY_LIMIT:]])
        Redis.setex(self._history_key(user_id, node_slug), HISTORY_TTL, payload)

    async def reboot_node(self, session, node_slug: str) -> None:
        node = self._require_ssh_node(session, node_slug)
        self.record_command(session, node_slug, "sudo reboot")
        conn = await asyncssh.connect(
            **_connect_kwargs(node.host, node.ssh_user, node.ssh_port)
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
                node = self._find_node(session, target.node_slug)
            except KeyError:
                return PingStatusEntry(
                    node_slug=target.node_slug,
                    status="unknown",
                )

            if not node.managed:
                return PingStatusEntry(
                    node_slug=target.node_slug,
                    status="unknown",
                )

            host = (node.host or "").strip()
            if not host:
                return PingStatusEntry(
                    node_slug=target.node_slug,
                    status="unknown",
                )

            task = host_checks.get(host)
            if task is None:
                task = asyncio.create_task(self._ping_host(host))
                host_checks[host] = task

            return PingStatusEntry(
                node_slug=target.node_slug,
                status="online" if await task else "offline",
            )

        return await asyncio.gather(*(check_target(target) for target in targets))

    async def proxy_terminal(self, session, node_slug: str, websocket) -> None:
        node = self._require_ssh_node(session, node_slug)
        conn = await asyncssh.connect(
            **_connect_kwargs(node.host, node.ssh_user, node.ssh_port)
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
                        self.record_command(session, node_slug, data.rstrip("\r\n"))
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
                    "host": node.host,
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
