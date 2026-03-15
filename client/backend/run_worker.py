#!/usr/bin/env python3
"""
Launcher for arq worker. Ensures an event loop exists before arq runs,
fixing Python 3.14+ compatibility (get_event_loop() no longer auto-creates).
"""
import asyncio

asyncio.set_event_loop(asyncio.new_event_loop())

from arq.cli import cli  # noqa: E402

if __name__ == "__main__":
    cli()
