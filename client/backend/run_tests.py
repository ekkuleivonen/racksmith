#!/usr/bin/env python3
"""Test runner."""

import sys

import pytest


def main() -> int:
    args = sys.argv[1:] if len(sys.argv) > 1 else ["tests/"]
    return pytest.main(["-v"] + args)


if __name__ == "__main__":
    sys.exit(main())
