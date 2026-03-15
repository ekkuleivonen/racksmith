"""Host and group I/O — read/write Ansible inventory, host_vars, group_vars.

Racksmith metadata is stored in host_vars/group_vars with a ``racksmith_``
prefix. This module re-exports from hosts_io and groups_io.
"""

from __future__ import annotations

from .groups_io import (
    GroupData,
    read_group,
    read_groups,
    remove_group,
    write_group,
)
from .hosts_io import (
    HostData,
    read_host,
    read_hosts,
    remove_host,
    write_host,
)

__all__ = [
    "GroupData",
    "HostData",
    "read_group",
    "read_groups",
    "read_host",
    "read_hosts",
    "remove_group",
    "remove_host",
    "write_group",
    "write_host",
]
