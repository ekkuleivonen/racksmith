"""Unit tests for ansible.runner._run_ansible."""

from __future__ import annotations

import asyncio
import json
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest

from ansible.runner import _run_ansible


class FakeStdout:
    """Simulates an asyncio subprocess stdout stream."""

    def __init__(self, chunks: list[bytes] | None = None, *, hang: bool = False):
        self._chunks = list(chunks or [])
        self._hang = hang

    async def read(self, n: int = -1) -> bytes:
        if self._hang:
            await asyncio.get_event_loop().create_future()  # never resolves
        if self._chunks:
            return self._chunks.pop(0)
        return b""


class FakeProcess:
    def __init__(
        self,
        stdout: FakeStdout,
        exit_code: int = 0,
    ):
        self.stdout = stdout
        self._exit_code = exit_code
        self._killed = False

    async def wait(self) -> int:
        return self._exit_code

    def kill(self) -> None:
        self._killed = True


def _make_redis() -> AsyncMock:
    redis = AsyncMock()
    redis.hset = AsyncMock()
    redis.expire = AsyncMock()
    redis.publish = AsyncMock()
    return redis


@pytest.fixture
def common_kwargs(tmp_path: Path) -> dict:
    return {
        "run_id": "test-run-1",
        "log_event": "test",
        "tmpdir": tmp_path,
        "command": ["echo", "hi"],
        "command_line": "$ echo hi\n",
    }


class TestRunAnsibleSuccess:
    async def test_streams_output_and_completes(self, common_kwargs: dict):
        process = FakeProcess(
            stdout=FakeStdout([b"task 1\n", b"task 2\n"]),
            exit_code=0,
        )
        redis = _make_redis()

        with patch("ansible.runner.asyncio.create_subprocess_exec", return_value=process):
            await _run_ansible(redis=redis, **common_kwargs)

        published = [json.loads(c.args[1]) for c in redis.publish.call_args_list]

        status_msgs = [m for m in published if m.get("type") == "status"]
        assert status_msgs[0]["status"] == "running"
        assert status_msgs[-1]["status"] == "completed"

        output_msgs = [m["data"] for m in published if m.get("type") == "output"]
        combined = "".join(output_msgs)
        assert "task 1" in combined
        assert "task 2" in combined

        done_msgs = [m for m in published if m.get("type") == "done"]
        assert len(done_msgs) == 1

    async def test_stores_exit_code_zero(self, common_kwargs: dict):
        process = FakeProcess(stdout=FakeStdout([b"ok\n"]), exit_code=0)
        redis = _make_redis()

        with patch("ansible.runner.asyncio.create_subprocess_exec", return_value=process):
            await _run_ansible(redis=redis, **common_kwargs)

        final_hset = redis.hset.call_args_list[-1]
        fields = final_hset.kwargs.get("mapping") or final_hset.args[1]
        assert fields["status"] == "completed"
        assert fields["exit_code"] == "0"


class TestRunAnsibleFailedExit:
    async def test_nonzero_exit_marks_failed(self, common_kwargs: dict):
        process = FakeProcess(stdout=FakeStdout([b"error\n"]), exit_code=2)
        redis = _make_redis()

        with patch("ansible.runner.asyncio.create_subprocess_exec", return_value=process):
            await _run_ansible(redis=redis, **common_kwargs)

        final_hset = redis.hset.call_args_list[-1]
        fields = final_hset.kwargs.get("mapping") or final_hset.args[1]
        assert fields["status"] == "failed"
        assert fields["exit_code"] == "2"


class TestRunAnsibleIdleTimeout:
    async def test_kills_process_on_idle_timeout(self, common_kwargs: dict):
        process = FakeProcess(stdout=FakeStdout(hang=True), exit_code=0)
        redis = _make_redis()

        with (
            patch("ansible.runner.asyncio.create_subprocess_exec", return_value=process),
            patch("ansible.runner.settings.ANSIBLE_IDLE_TIMEOUT", 0.1),
        ):
            await _run_ansible(redis=redis, **common_kwargs)

        assert process._killed

        published = [json.loads(c.args[1]) for c in redis.publish.call_args_list]

        output_msgs = [m["data"] for m in published if m.get("type") == "output"]
        combined = "".join(output_msgs)
        assert "No output for" in combined
        assert "killing" in combined

        status_msgs = [m for m in published if m.get("type") == "status"]
        assert status_msgs[-1]["status"] == "failed"

        final_hset = redis.hset.call_args_list[-1]
        fields = final_hset.kwargs.get("mapping") or final_hset.args[1]
        assert fields["status"] == "failed"
        assert fields["exit_code"] == "-1"

    async def test_no_timeout_when_output_flows(self, common_kwargs: dict):
        """A process that keeps producing output should never hit the idle timeout."""
        process = FakeProcess(
            stdout=FakeStdout([b"chunk\n"] * 5),
            exit_code=0,
        )
        redis = _make_redis()

        with (
            patch("ansible.runner.asyncio.create_subprocess_exec", return_value=process),
            patch("ansible.runner.settings.ANSIBLE_IDLE_TIMEOUT", 0.1),
        ):
            await _run_ansible(redis=redis, **common_kwargs)

        assert not process._killed
        final_hset = redis.hset.call_args_list[-1]
        fields = final_hset.kwargs.get("mapping") or final_hset.args[1]
        assert fields["status"] == "completed"


class TestRunAnsibleCommandNotFound:
    async def test_file_not_found_marks_failed_127(self, common_kwargs: dict):
        redis = _make_redis()

        with patch(
            "ansible.runner.asyncio.create_subprocess_exec",
            side_effect=FileNotFoundError,
        ):
            await _run_ansible(redis=redis, **common_kwargs)

        final_hset = redis.hset.call_args_list[-1]
        fields = final_hset.kwargs.get("mapping") or final_hset.args[1]
        assert fields["status"] == "failed"
        assert fields["exit_code"] == "127"

        published = [json.loads(c.args[1]) for c in redis.publish.call_args_list]
        output_msgs = [m["data"] for m in published if m.get("type") == "output"]
        assert any("not found" in o for o in output_msgs)
