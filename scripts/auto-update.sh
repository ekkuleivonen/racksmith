#!/bin/sh
set -u

cd /workspace

# Mounted repos can trigger "dubious ownership" in containers.
git config --global --add safe.directory /workspace >/dev/null 2>&1 || true

while true; do
  echo "[$(date)] Running git pull..."
  BEFORE="$(git rev-parse HEAD 2>/dev/null || echo '')"

  if ! git pull --ff-only; then
    echo "[$(date)] git pull failed; will retry in 60s."
    sleep 60
    continue
  fi

  AFTER="$(git rev-parse HEAD 2>/dev/null || echo '')"

  if [ -n "$BEFORE" ] && [ -n "$AFTER" ] && [ "$BEFORE" != "$AFTER" ]; then
    echo "[$(date)] Changes detected ($BEFORE -> $AFTER). Rebuilding stack..."
    # Use a one-off container so we're not stopped by 'docker compose down'
    if docker run --rm \
      -v /var/run/docker.sock:/var/run/docker.sock \
      -v /workspace:/workspace \
      -w /workspace \
      docker:25 \
      sh -c "docker compose down && docker compose up -d --build"
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
