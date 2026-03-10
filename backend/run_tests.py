#!/usr/bin/env python3
"""Test runner that fixes stdlib shadowing before invoking pytest.

The project has a 'code' package that shadows stdlib 'code', which breaks
pdb. Prepend stdlib to sys.path before pytest loads."""

import os
import sys

# Prepend stdlib and pre-import so pdb gets the right 'code' module
stdlib = os.path.dirname(os.__file__)
sys.path.insert(0, stdlib)
# Remove project's code if it was imported, then load stdlib
if "code" in sys.modules:
    del sys.modules["code"]
import code  # noqa: E402 # Load stdlib code before pytest/pdb runs

assert hasattr(code, "InteractiveConsole")

import pytest  # noqa: E402


def main() -> int:
    args = sys.argv[1:] if len(sys.argv) > 1 else ["tests/"]
    return pytest.main(["-v"] + args)


if __name__ == "__main__":
    sys.exit(main())
