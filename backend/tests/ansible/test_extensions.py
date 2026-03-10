"""Unit tests for ansible.extensions."""

from ansible.extensions import PREFIX, extract, inject, is_extension


class TestExtract:
    """extract(all_vars) -> (ansible_vars, racksmith_vars)."""

    def test_splits_by_prefix(self) -> None:
        all_vars = {
            "ansible_host": "10.0.0.1",
            "racksmith_name": "Web Server",
            "racksmith_labels": ["web", "prod"],
        }
        ansible, racksmith = extract(all_vars)
        assert ansible == {"ansible_host": "10.0.0.1"}
        assert racksmith == {"name": "Web Server", "labels": ["web", "prod"]}

    def test_strips_prefix_from_keys(self) -> None:
        ansible, racksmith = extract({"racksmith_rack": "r1", "racksmith_notes": "x"})
        assert "racksmith_rack" not in racksmith
        assert racksmith["rack"] == "r1"
        assert racksmith["notes"] == "x"

    def test_empty_input(self) -> None:
        ansible, racksmith = extract({})
        assert ansible == {}
        assert racksmith == {}

    def test_only_ansible_vars(self) -> None:
        ansible, racksmith = extract({"ansible_user": "deploy", "foo": "bar"})
        assert ansible == {"ansible_user": "deploy", "foo": "bar"}
        assert racksmith == {}

    def test_only_racksmith_vars(self) -> None:
        ansible, racksmith = extract({"racksmith_managed": True})
        assert ansible == {}
        assert racksmith == {"managed": True}


class TestInject:
    """inject(racksmith_vars) -> dict with prefix."""

    def test_adds_prefix(self) -> None:
        result = inject({"name": "Foo", "labels": ["a"]})
        assert result == {"racksmith_name": "Foo", "racksmith_labels": ["a"]}

    def test_empty_input(self) -> None:
        assert inject({}) == {}

    def test_roundtrip_with_extract(self) -> None:
        original = {"name": "x", "rack": "r1"}
        injected = inject(original)
        _, extracted = extract(injected)
        assert extracted == original


class TestIsExtension:
    """is_extension(key) checks for racksmith_ prefix."""

    def test_racksmith_prefix_true(self) -> None:
        assert is_extension("racksmith_name") is True
        assert is_extension("racksmith_labels") is True
        assert is_extension("racksmith_") is True

    def test_non_prefix_false(self) -> None:
        assert is_extension("ansible_host") is False
        assert is_extension("name") is False
        assert is_extension("racksmithish") is False  # no underscore

    def test_prefix_constant(self) -> None:
        assert PREFIX == "racksmith_"
