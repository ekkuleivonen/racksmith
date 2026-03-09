"""Unit tests for ansible.devices."""

from ansible.devices import (
    DeviceData,
    read_device,
    read_devices,
    remove_device,
    write_device,
)


class TestReadDevices:
    """read_devices(layout)."""

    def test_empty_when_no_file(self, layout) -> None:
        assert read_devices(layout) == []

    def test_parses_devices_yml(self, layout) -> None:
        layout.devices_file.parent.mkdir(parents=True, exist_ok=True)
        layout.devices_file.write_text("""
patch-panel:
  name: patch panel
  notes: ""
  labels: []
  mac_address: ""
  rack: r_1cd22b
  position_u_start: 12
  position_u_height: 1
  position_col_start: 0
  position_col_count: 12
""")
        devices = read_devices(layout)
        assert len(devices) == 1
        d = devices[0]
        assert d.id == "patch-panel"
        assert d.name == "patch panel"
        assert d.rack == "r_1cd22b"
        assert d.position_u_start == 12
        assert d.position_u_height == 1
        assert d.position_col_start == 0
        assert d.position_col_count == 12

    def test_uses_defaults_for_missing_fields(self, layout) -> None:
        layout.devices_file.parent.mkdir(parents=True, exist_ok=True)
        layout.devices_file.write_text("minimal: {}\n")
        devices = read_devices(layout)
        assert len(devices) == 1
        assert devices[0].id == "minimal"
        assert devices[0].name == "minimal"
        assert devices[0].notes == ""
        assert devices[0].labels == []
        assert devices[0].position_u_start == 1


class TestReadDevice:
    """read_device(layout, device_id)."""

    def test_returns_none_when_missing(self, layout) -> None:
        assert read_device(layout, "nonexistent") is None

    def test_returns_device_when_exists(self, layout) -> None:
        layout.devices_file.parent.mkdir(parents=True, exist_ok=True)
        layout.devices_file.write_text("""
ups1:
  name: UPS
  rack: r_1
""")
        d = read_device(layout, "ups1")
        assert d is not None
        assert d.id == "ups1"
        assert d.name == "UPS"


class TestWriteDevice:
    """write_device(layout, device)."""

    def test_creates_file_if_missing(self, layout) -> None:
        layout.devices_file.parent.mkdir(parents=True, exist_ok=True)
        device = DeviceData(
            id="d_abc123",
            name="Test Device",
            rack="r_1",
            position_u_start=5,
        )
        write_device(layout, device)
        assert layout.devices_file.is_file()
        devices = read_devices(layout)
        assert len(devices) == 1
        assert devices[0].id == "d_abc123"
        assert devices[0].name == "Test Device"


class TestRemoveDevice:
    """remove_device(layout, device_id)."""

    def test_noop_when_file_missing(self, layout) -> None:
        remove_device(layout, "any")  # should not raise

    def test_removes_device(self, layout) -> None:
        layout.devices_file.parent.mkdir(parents=True, exist_ok=True)
        layout.devices_file.write_text("d1:\n  name: Device 1\n")
        remove_device(layout, "d1")
        assert read_devices(layout) == []
