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

    def test_rejects_list_type(self) -> None:
        with pytest.raises(ValidationError):
            RoleInputSpec.model_validate({"key": "dirs", "type": "list"})

    def test_rejects_dict_type(self) -> None:
        with pytest.raises(ValidationError):
            RoleInputSpec.model_validate({"key": "opts", "type": "dict"})

    def test_rejects_unknown_type(self) -> None:
        with pytest.raises(ValidationError):
            RoleInputSpec.model_validate({"key": "x", "type": "foobar"})
