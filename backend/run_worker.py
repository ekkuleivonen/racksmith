#!/usr/bin/env python3
"""
Launcher for arq worker. Ensures an event loop exists before arq runs,
fixing Python 3.14+ compatibility (get_event_loop() no longer auto-creates).
"""
import asyncio
import sys

if sys.version_info >= (3, 14):
    asyncio.set_event_loop(asyncio.new_event_loop())

from arq.cli import cli

if __name__ == "__main__":
    cli()
