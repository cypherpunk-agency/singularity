#!/bin/bash
# Watch for restart requests and rebuild/restart control-plane + UI
# This script runs in the background as root and monitors for restart requests

RESTART_FILE="/app/state/restart-requested"
LOG_FILE="/app/logs/restart-watcher.log"
CONTROL_PLANE_PORT="${CONTROL_PLANE_PORT:-3001}"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "Restart watcher started"

while true; do
    if [[ -f "$RESTART_FILE" ]]; then
        log "Restart request detected"
        rm -f "$RESTART_FILE"

        # Rebuild control-plane and UI
        log "Building packages..."
        cd /app
        if su -s /bin/bash agent -c 'pnpm --filter @singularity/control-plane --filter @singularity/ui build' >> "$LOG_FILE" 2>&1; then
            log "Build successful"
        else
            log "Build failed! Check $LOG_FILE for details"
            continue
        fi

        # Kill the current control-plane process
        log "Stopping control-plane..."
        pkill -f "node.*control-plane/dist" || true
        sleep 2

        # Restart control-plane (as agent user)
        log "Starting control-plane..."
        su -s /bin/bash agent -c 'node /app/packages/control-plane/dist/index.js >> /app/logs/control-plane.log 2>&1' &

        # Wait for it to be healthy
        for i in {1..30}; do
            if curl -s "http://localhost:${CONTROL_PLANE_PORT}/health" > /dev/null 2>&1; then
                log "Control-plane restarted successfully"
                break
            fi
            sleep 1
        done

        if ! curl -s "http://localhost:${CONTROL_PLANE_PORT}/health" > /dev/null 2>&1; then
            log "Warning: Control-plane may not have started properly"
        fi
    fi
    sleep 5
done
