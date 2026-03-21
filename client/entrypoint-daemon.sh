#!/bin/sh
set -e

# Bind-mounted volumes are created as root:root by Docker on first run.
# Fix ownership so the unprivileged app user can write.
chown -R racksmith:racksmith /data

exec "$@"
