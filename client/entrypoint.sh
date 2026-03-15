#!/bin/bash
set -e

mkdir -p /app/data/redis /app/workspace
chown -R racksmith:racksmith /app/data /app/workspace

exec /usr/bin/supervisord -c /etc/supervisord.conf
