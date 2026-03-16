"""Unit tests for shared schemas."""

import pytest
from pydantic import ValidationError

from _utils.schemas import RoleInputSpec


class TestRoleInputSpecTypes:
    def test_accepts_list_type(self) -> None:
        spec = RoleInputSpec(key="dirs", type="list")
        assert spec.type == "list"

    def test_accepts_dict_type(self) -> None:
        spec = RoleInputSpec(key="opts", type="dict")
        assert spec.type == "dict"

    def test_accepts_list_default(self) -> None:
        spec = RoleInputSpec(key="dirs", type="list", default=["/mnt/data", "/mnt/backups"])
        assert spec.default == ["/mnt/data", "/mnt/backups"]

    def test_accepts_dict_default(self) -> None:
        spec = RoleInputSpec(key="opts", type="dict", default={"fstype": "ext4"})
        assert spec.default == {"fstype": "ext4"}

    def test_rejects_unknown_type(self) -> None:
        with pytest.raises(ValidationError):
            RoleInputSpec.model_validate({"key": "x", "type": "foobar"})
