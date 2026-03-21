"""Unit tests for shared schemas."""

import pytest
from pydantic import ValidationError

from _utils.schemas import RoleInputSpec


class TestRoleInputSpecTypes:
    def test_accepts_string_type(self) -> None:
        spec = RoleInputSpec(key="name", type="string")
        assert spec.type == "string"

    def test_accepts_bool_type(self) -> None:
        spec = RoleInputSpec(key="flag", type="bool")
        assert spec.type == "bool"

    def test_accepts_list_type(self) -> None:
        spec = RoleInputSpec.model_validate({"key": "dirs", "type": "list"})
        assert spec.type == "list"

    def test_accepts_dict_type(self) -> None:
        spec = RoleInputSpec.model_validate({"key": "opts", "type": "dict"})
        assert spec.type == "dict"

    def test_accepts_int_type(self) -> None:
        spec = RoleInputSpec.model_validate({"key": "count", "type": "int"})
        assert spec.type == "int"

    def test_list_default(self) -> None:
        spec = RoleInputSpec.model_validate(
            {"key": "pkgs", "type": "list", "default": ["a", "b"]}
        )
        assert spec.default == ["a", "b"]

    def test_dict_default(self) -> None:
        spec = RoleInputSpec.model_validate(
            {"key": "opts", "type": "dict", "default": {"k": "v"}}
        )
        assert spec.default == {"k": "v"}

    def test_rejects_unknown_type(self) -> None:
        with pytest.raises(ValidationError):
            RoleInputSpec.model_validate({"key": "x", "type": "foobar"})
