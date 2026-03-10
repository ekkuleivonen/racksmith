"""Unit tests for schema/docs markdown generation."""

from __future__ import annotations


def test_generate_docs_contains_expected_sections() -> None:
    from schema.docs import generate_docs

    doc = generate_docs()
    assert "# Ansible-Native Schema Reference" in doc
    assert "inventory" in doc.lower()
    assert ".racksmith" in doc
    assert "roles" in doc.lower()
    assert "playbooks" in doc.lower()
    assert "racks" in doc.lower()
