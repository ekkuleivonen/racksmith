"""Unit tests for ansible.racks."""

from ansible.racks import RackData, read_rack, read_racks, remove_rack, write_rack


class TestReadRacks:
    """read_racks(layout)."""

    def test_empty_when_no_file(self, layout) -> None:
        assert read_racks(layout) == []

    def test_parses_racks_yml(self, layout) -> None:
        layout.racks_file.parent.mkdir(parents=True, exist_ok=True)
        layout.racks_file.write_text("""
rack_a:
  name: Rack A - Row 1
  rack_units: 42
  rack_width_inches: 19
  rack_cols: 1
  created_at: "2025-01-01T00:00:00Z"
  updated_at: "2025-01-01T00:00:00Z"
rack_b:
  name: Rack B
  rack_units: 12
  rack_cols: 2
""")
        racks = read_racks(layout)
        assert len(racks) == 2
        by_id = {r.id: r for r in racks}
        assert by_id["rack_a"].name == "Rack A - Row 1"
        assert by_id["rack_a"].rack_units == 42
        assert by_id["rack_a"].rack_width_inches == 19
        assert by_id["rack_a"].rack_cols == 1
        assert by_id["rack_b"].rack_units == 12
        assert by_id["rack_b"].rack_cols == 2

    def test_uses_defaults_for_missing_fields(self, layout) -> None:
        layout.racks_file.parent.mkdir(parents=True, exist_ok=True)
        layout.racks_file.write_text("minimal: {}\n")
        racks = read_racks(layout)
        assert len(racks) == 1
        assert racks[0].id == "minimal"
        assert racks[0].name == "minimal"
        assert racks[0].rack_units == 12
        assert racks[0].rack_width_inches == 19
        assert racks[0].rack_cols == 1

    def test_handles_invalid_yaml(self, layout) -> None:
        layout.racks_file.parent.mkdir(parents=True, exist_ok=True)
        layout.racks_file.write_text("not valid: yaml: [")
        assert read_racks(layout) == []

    def test_handles_non_dict_root(self, layout) -> None:
        layout.racks_file.parent.mkdir(parents=True, exist_ok=True)
        layout.racks_file.write_text("- list\n")
        assert read_racks(layout) == []


class TestReadRack:
    """read_rack(layout, rack_id)."""

    def test_returns_none_when_missing(self, layout) -> None:
        assert read_rack(layout, "nonexistent") is None

    def test_returns_rack_when_exists(self, layout) -> None:
        layout.racks_file.parent.mkdir(parents=True, exist_ok=True)
        layout.racks_file.write_text("""
r1:
  name: R1
  rack_units: 24
""")
        rack = read_rack(layout, "r1")
        assert rack is not None
        assert rack.id == "r1"
        assert rack.name == "R1"
        assert rack.rack_units == 24


class TestWriteRack:
    """write_rack(layout, rack)."""

    def test_creates_file(self, layout) -> None:
        rack = RackData(
            id="new",
            name="New Rack",
            rack_units=42,
            rack_width_inches=19,
            rack_cols=2,
            created_at="2025-01-01T00:00:00Z",
            updated_at="2025-01-01T00:00:00Z",
        )
        write_rack(layout, rack)
        assert layout.racks_file.exists()
        racks = read_racks(layout)
        assert len(racks) == 1
        assert racks[0].name == "New Rack"

    def test_updates_existing(self, layout) -> None:
        layout.racks_file.parent.mkdir(parents=True, exist_ok=True)
        layout.racks_file.write_text("""
r1:
  name: Old
  rack_units: 12
  rack_width_inches: 19
  rack_cols: 1
  created_at: ""
  updated_at: ""
""")
        write_rack(
            layout,
            RackData(
                id="r1",
                name="Updated",
                rack_units=24,
                rack_width_inches=19,
                rack_cols=2,
                created_at="2025-01-01",
                updated_at="2025-01-02",
            ),
        )
        racks = read_racks(layout)
        assert len(racks) == 1
        assert racks[0].name == "Updated"
        assert racks[0].rack_units == 24

    def test_roundtrip(self, layout) -> None:
        original = RackData(
            id="rt",
            name="Roundtrip Rack",
            rack_units=48,
            rack_width_inches=19,
            rack_cols=3,
            created_at="2025-01-01T00:00:00Z",
            updated_at="2025-01-02T00:00:00Z",
        )
        write_rack(layout, original)
        read_back = read_rack(layout, "rt")
        assert read_back is not None
        assert read_back.id == original.id
        assert read_back.name == original.name
        assert read_back.rack_units == original.rack_units
        assert read_back.rack_cols == original.rack_cols
        assert read_back.created_at == original.created_at
        assert read_back.updated_at == original.updated_at


class TestRemoveRack:
    """remove_rack(layout, rack_id)."""

    def test_removes_rack_from_file(self, layout) -> None:
        layout.racks_file.parent.mkdir(parents=True, exist_ok=True)
        layout.racks_file.write_text("""
r1: { name: R1, rack_units: 12 }
r2: { name: R2, rack_units: 12 }
""")
        remove_rack(layout, "r1")
        racks = read_racks(layout)
        assert len(racks) == 1
        assert racks[0].id == "r2"

    def test_idempotent_when_file_missing(self, layout) -> None:
        remove_rack(layout, "any")  # should not raise

    def test_idempotent_when_rack_missing(self, layout) -> None:
        layout.racks_file.parent.mkdir(parents=True, exist_ok=True)
        layout.racks_file.write_text("r1: { name: R1 }\n")
        remove_rack(layout, "r2")  # r2 doesn't exist
        assert len(read_racks(layout)) == 1
