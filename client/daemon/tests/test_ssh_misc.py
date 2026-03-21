"""Unit tests for ssh probe helpers and ssh key utilities."""

from __future__ import annotations

from unittest.mock import patch

import pytest

from ssh.keys import generate_ssh_key_pair, machine_public_key
from ssh.probe import _detect_os_name, _extract_mac, _parse_os_release


class TestParseOsRelease:
    def test_typical(self):
        raw = 'NAME="Ubuntu"\nVERSION_ID="22.04"\nPRETTY_NAME="Ubuntu 22.04 LTS"\n'
        result = _parse_os_release(raw)
        assert result["NAME"] == "Ubuntu"
        assert result["VERSION_ID"] == "22.04"
        assert result["PRETTY_NAME"] == "Ubuntu 22.04 LTS"

    def test_empty(self):
        assert _parse_os_release("") == {}

    def test_skips_lines_without_equals(self):
        raw = "some garbage\nKEY=val\n"
        result = _parse_os_release(raw)
        assert result == {"KEY": "val"}


class TestDetectOsName:
    def test_hostnamectl_preferred(self):
        result = _detect_os_name(
            {"PRETTY_NAME": "Ubuntu 22.04"}, "Debian GNU/Linux 12", "Linux 6.1"
        )
        assert result == "Debian GNU/Linux 12"

    def test_pretty_name_fallback(self):
        result = _detect_os_name({"PRETTY_NAME": "Ubuntu 22.04"}, "", "Linux 6.1")
        assert result == "Ubuntu 22.04"

    def test_name_and_version_fallback(self):
        result = _detect_os_name({"NAME": "Ubuntu", "VERSION_ID": "22.04"}, "", "")
        assert result == "Ubuntu 22.04"

    def test_name_only(self):
        result = _detect_os_name({"NAME": "Alpine"}, "", "")
        assert result == "Alpine"

    def test_uname_with_marker(self):
        result = _detect_os_name({}, "", "OPNsense 23.1")
        assert result == "OPNsense 23.1"

    def test_empty_returns_empty(self):
        result = _detect_os_name({}, "", "Linux 6.1.0")
        assert result == ""


class TestExtractMac:
    def test_valid_mac(self):
        raw = "aa:bb:cc:dd:ee:ff\n"
        assert _extract_mac(raw) == "aa:bb:cc:dd:ee:ff"

    def test_skips_all_zeros(self):
        raw = "00:00:00:00:00:00\naa:bb:cc:dd:ee:ff\n"
        assert _extract_mac(raw) == "aa:bb:cc:dd:ee:ff"

    def test_empty(self):
        assert _extract_mac("") == ""

    def test_no_valid_mac(self):
        assert _extract_mac("not-a-mac\n") == ""


class TestMachinePublicKey:
    def test_reads_existing_key(self, tmp_path):
        with patch("ssh.misc.settings") as s:
            s.DATA_DIR = str(tmp_path)
            ssh_dir = tmp_path / ".ssh"
            ssh_dir.mkdir()
            (ssh_dir / "id_ed25519.pub").write_text("ssh-ed25519 AAAA test@racksmith")
            result = machine_public_key()
        assert result == "ssh-ed25519 AAAA test@racksmith"

    def test_raises_when_no_key(self, tmp_path):
        with patch("ssh.misc.settings") as s:
            s.DATA_DIR = str(tmp_path)
            with pytest.raises(FileNotFoundError, match="No public SSH key"):
                machine_public_key()


class TestGenerateSshKeyPair:
    def test_generates_key(self, tmp_path):
        with patch("ssh.misc.settings") as s:
            s.DATA_DIR = str(tmp_path)
            pub = generate_ssh_key_pair()
        assert pub.startswith("ssh-ed25519 ")
        assert "racksmith" in pub
        ssh_dir = tmp_path / ".ssh"
        assert (ssh_dir / "id_ed25519").is_file()
        assert (ssh_dir / "id_ed25519.pub").is_file()

    def test_idempotent(self, tmp_path):
        with patch("ssh.misc.settings") as s:
            s.DATA_DIR = str(tmp_path)
            pub1 = generate_ssh_key_pair()
            pub2 = generate_ssh_key_pair()
        assert pub1 == pub2
