#!/bin/sh
set -e

# Bind-mounted volumes are created as root:root by Docker on first run.
# Fix ownership so the unprivileged app user can write.
# Only chown dirs this service owns — avoid clobbering sibling volumes
# (e.g. ./data/redis is managed by the redis container with a different UID).
mkdir -p /data/.ssh
chown racksmith:racksmith /data /data/.ssh
chmod 700 /data/.ssh

exec "$@"
