#!/usr/bin/env python3
"""Launcher for arq worker (daemon side)."""

import asyncio

asyncio.set_event_loop(asyncio.new_event_loop())

from arq.cli import cli  # noqa: E402

if __name__ == "__main__":
    cli()
