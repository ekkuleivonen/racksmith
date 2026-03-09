"""Ansible bridge — pure functions for Ansible file structures."""

from .config import AnsibleLayout, resolve_layout

__all__ = [
    "AnsibleLayout",
    "resolve_layout",
]
