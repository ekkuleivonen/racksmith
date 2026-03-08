#!/bin/sh
set -u

cd /workspace

# Mounted repos can trigger "dubious ownership" in containers.
git config --global --add safe.directory /workspace >/dev/null 2>&1 || true

# Detect the host owner of the workspace so we can restore ownership after git
# operations. Running as root inside the container would otherwise leave
# .git/object files owned by root on the host, breaking host-side git pulls.
WORKSPACE_OWNER="$(stat -c '%u:%g' /workspace)"

fix_git_ownership() {
  chown -R "$WORKSPACE_OWNER" /workspace/.git 2>/dev/null || true
}

# When passed --rebuild, we were re-exec'd after a git pull to pick up script changes.
# Run the rebuild and continue the loop (don't re-exec again).
REBUILD_NOW="${1:-}"

while true; do
  echo "[$(date)] Running git pull..."
  BEFORE="$(git rev-parse HEAD 2>/dev/null || echo '')"

  if ! git pull --ff-only; then
    echo "[$(date)] git pull failed; will retry in 60s."
    fix_git_ownership
    sleep 60
    continue
  fi
  fix_git_ownership

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
    # Use same project name as host (from directory name) so we replace existing containers, not create duplicates
    PROJECT_NAME="$(basename "${HOST_WORKSPACE}")"
    if docker run --rm \
      -e HOST_WORKSPACE="${HOST_WORKSPACE}" \
      -e PROJECT_NAME="${PROJECT_NAME}" \
      -v /var/run/docker.sock:/var/run/docker.sock \
      -v "${HOST_WORKSPACE}:/workspace" \
      -w /workspace \
      docker:25 \
      sh -c 'docker compose -p "$PROJECT_NAME" -f /workspace/docker-compose.yml build app worker frontend && docker compose -p "$PROJECT_NAME" -f /workspace/docker-compose.yml up -d --no-deps app worker frontend'
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
