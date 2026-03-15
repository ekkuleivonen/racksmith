"""Unit tests for ansible.migrations."""

from conftest import write_racksmith_yml as _write_racksmith_yml

from core.migrations import (
    current_schema_version,
    detect_schema_version,
    write_schema_version,
)
from core.racksmith_meta import read_meta


class TestDetectSchemaVersion:
    """detect_schema_version(layout)."""

    def test_defaults_to_current_when_no_file(self, layout) -> None:
        assert detect_schema_version(layout) == 1

    def test_reads_from_racksmith_yml(self, layout) -> None:
        _write_racksmith_yml(layout, {"schema_version": 2})
        assert detect_schema_version(layout) == 2

    def test_handles_invalid_yaml(self, layout) -> None:
        path = layout.racksmith_base / ".racksmith.yml"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("not valid: yaml: [")
        assert detect_schema_version(layout) == 1


class TestWriteSchemaVersion:
    """write_schema_version(layout, version)."""

    def test_writes_to_racksmith_yml(self, layout) -> None:
        write_schema_version(layout, 3, racksmith_version="1.0.0")
        meta = read_meta(layout)
        assert meta.schema_version == 3
        assert meta.racksmith_version == "1.0.0"

    def test_preserves_existing_data(self, layout) -> None:
        _write_racksmith_yml(layout, {
            "schema_version": 2,
            "racks": {"r1": {"name": "Rack 1"}},
        })
        write_schema_version(layout, 3, racksmith_version="1.0.0")
        meta = read_meta(layout)
        assert meta.schema_version == 3
        assert "r1" in meta.racks


class TestCurrentSchemaVersion:
    def test_current_version_from_migrations(self) -> None:
        assert current_schema_version() >= 1
