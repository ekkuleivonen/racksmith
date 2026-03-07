#!/bin/sh

cd /workspace

while true; do
  echo "[$(date)] Running git pull..."
  BEFORE=$(git rev-parse HEAD 2>/dev/null || true)
  git pull 2>/dev/null || true
  AFTER=$(git rev-parse HEAD 2>/dev/null || true)

  if [ -n "$BEFORE" ] && [ -n "$AFTER" ] && [ "$BEFORE" != "$AFTER" ]; then
    echo "[$(date)] Changes detected! Rebuilding stack..."
    # Use a one-off container so we're not stopped by 'docker compose down'
    docker run --rm \
      -v /var/run/docker.sock:/var/run/docker.sock \
      -v /workspace:/workspace \
      -w /workspace \
      docker:24 \
      sh -c "docker compose down && docker compose up -d --build"
    echo "[$(date)] Rebuild complete."
  fi

  sleep 60
done
