#!/bin/sh
set -u

cd /workspace

# Mounted repos can trigger "dubious ownership" in containers.
git config --global --add safe.directory /workspace >/dev/null 2>&1 || true

# When passed --rebuild, we were re-exec'd after a git pull to pick up script changes.
# Run the rebuild and continue the loop (don't re-exec again).
REBUILD_NOW="${1:-}"

while true; do
  echo "[$(date)] Running git pull..."
  BEFORE="$(git rev-parse HEAD 2>/dev/null || echo '')"

  if ! git pull --ff-only; then
    echo "[$(date)] git pull failed; will retry in 60s."
    sleep 60
    continue
  fi

  AFTER="$(git rev-parse HEAD 2>/dev/null || echo '')"
  CHANGED="$([ -n "$BEFORE" ] && [ -n "$AFTER" ] && [ "$BEFORE" != "$AFTER" ] && echo 1 || true)"

  # When changes detected, re-exec to pick up script updates from git pull, then rebuild
  if [ -n "$CHANGED" ] && [ "$REBUILD_NOW" != "--rebuild" ]; then
    echo "[$(date)] Changes detected ($BEFORE -> $AFTER). Re-execing to pick up script changes..."
    exec "$0" --rebuild
  fi

  # Rebuild only app, worker, frontend - leave redis and auto-update running
  if [ -n "$CHANGED" ] || [ "$REBUILD_NOW" = "--rebuild" ]; then
    echo "[$(date)] Rebuilding stack..."
    # Use a one-off container so we're not stopped by 'docker compose down'.
    # HOST_WORKSPACE must be the real host path (set via env in docker-compose.yml)
    # because Docker resolves volume paths on the host, not inside this container.
    if docker run --rm \
      -v /var/run/docker.sock:/var/run/docker.sock \
      -v "${HOST_WORKSPACE}:/workspace" \
      -w /workspace \
      docker:25 \
      sh -c "docker compose -f /workspace/docker-compose.yml build app worker frontend && docker compose -f /workspace/docker-compose.yml up -d --no-deps app worker frontend"
    then
      echo "[$(date)] Rebuild complete."
    else
      echo "[$(date)] Rebuild failed."
    fi
  else
    echo "[$(date)] No changes."
  fi

  sleep 60
done
