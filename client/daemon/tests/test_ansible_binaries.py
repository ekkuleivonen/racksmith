"""Tests for ansible.binaries.resolve_ansible_cli."""

from __future__ import annotations

from pathlib import Path
from unittest.mock import patch

from ansible import binaries


def test_resolve_finds_script_in_sys_prefix_bin(tmp_path: Path) -> None:
    """Simulates a venv where sys.prefix points to the venv root."""
    vbin = tmp_path / "bin"
    vbin.mkdir()
    galaxy = vbin / "ansible-galaxy"
    galaxy.write_text("#!/bin/sh\necho ok\n")
    galaxy.chmod(0o755)

    with patch.object(binaries.sys, "prefix", str(tmp_path)):
        assert binaries.resolve_ansible_cli("ansible-galaxy") == str(galaxy)


def test_resolve_falls_back_to_which(tmp_path: Path) -> None:
    """When the script isn't in sys.prefix/bin, fall back to shutil.which."""
    with (
        patch.object(binaries.sys, "prefix", str(tmp_path)),
        patch.object(binaries.shutil, "which", return_value="/usr/bin/ansible-galaxy"),
    ):
        assert binaries.resolve_ansible_cli("ansible-galaxy") == "/usr/bin/ansible-galaxy"


def test_resolve_raises_when_not_found(tmp_path: Path) -> None:
    """FileNotFoundError when nowhere to be found."""
    with (
        patch.object(binaries.sys, "prefix", str(tmp_path)),
        patch.object(binaries.shutil, "which", return_value=None),
    ):
        try:
            binaries.resolve_ansible_cli("ansible-galaxy")
            raise AssertionError("Expected FileNotFoundError")
        except FileNotFoundError:
            pass
