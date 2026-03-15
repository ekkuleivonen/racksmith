"""Shared run management mixin for role and playbook managers."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

from _utils.streaming import stream_run as _stream_run


class RunManagerMixin(ABC):
    """Mixin providing arq pool management and WebSocket streaming for run managers."""

    _arq_pool = None

    @abstractmethod
    async def _load_run(self, run_id: str) -> Any | None:
        """Load a run from Redis, or None if expired/missing. Must be implemented by subclass."""
        ...

    def set_arq_pool(self, pool) -> None:
        self._arq_pool = pool

    def _ensure_arq_pool(self):
        if self._arq_pool is None:
            raise RuntimeError("arq pool not initialized")
        return self._arq_pool

    async def stream_run(self, run_id: str, websocket) -> None:
        await _stream_run(run_id, websocket, self._load_run)
