#!/bin/bash
# Singularity Agent Entrypoint
# Initializes state, starts control plane and cron daemon

set -e

echo "[$(date -Iseconds)] Singularity Agent starting..."

# Ensure directories exist with proper permissions
mkdir -p /app/agent/memory
mkdir -p /app/agent/conversation/web
mkdir -p /app/agent/conversation/telegram
mkdir -p /app/logs/agent-output
mkdir -p /app/logs/agent-input
mkdir -p /app/state
mkdir -p /home/agent/.claude
mkdir -p /home/agent/.config
chown -R agent:agent /app/agent /app/logs /app/state /home/agent/.claude /home/agent/.config

# Initialize session ID if not exists
if [ ! -f /app/state/session-id.txt ]; then
    uuidgen > /app/state/session-id.txt 2>/dev/null || \
        cat /proc/sys/kernel/random/uuid > /app/state/session-id.txt
    echo "[$(date -Iseconds)] Created new session ID: $(cat /app/state/session-id.txt)"
fi

# Initialize memory structure if needed
if [ ! -f /app/agent/MEMORY.md ]; then
    cat > /app/agent/MEMORY.md << 'EOF'
# Long-Term Memory

This file contains persistent decisions, preferences, and important facts.
The agent will update this file when learning new permanent information.

## Preferences

_None recorded yet._

## Decisions

_None recorded yet._

## Important Facts

_None recorded yet._
EOF
    chown agent:agent /app/agent/MEMORY.md
    echo "[$(date -Iseconds)] Created initial MEMORY.md"
fi

# Initialize run history if not exists
if [ ! -f /app/state/run-history.jsonl ]; then
    touch /app/state/run-history.jsonl
    chown agent:agent /app/state/run-history.jsonl
fi

# Vector search is now handled by the separate vector service container
# No need to pre-download embedding model here

# Set up environment for cron jobs
printenv | grep -E '^(AGENT_|TZ|EMBEDDING_|PATH)' > /etc/environment

# Start SSH daemon
if [ -f /home/agent/.ssh/authorized_keys ]; then
    chmod 700 /home/agent/.ssh
    chmod 600 /home/agent/.ssh/authorized_keys
    chown -R agent:agent /home/agent/.ssh
fi
echo "[$(date -Iseconds)] Starting SSH daemon..."
/usr/sbin/sshd

# Start cron daemon
echo "[$(date -Iseconds)] Starting cron daemon..."
cron

# Start control plane in background (as agent user)
echo "[$(date -Iseconds)] Starting control plane..."
cd /app
su -s /bin/bash agent -c 'HOME=/home/agent node /app/packages/control-plane/dist/index.js' &
CONTROL_PLANE_PID=$!
echo "[$(date -Iseconds)] Control plane started (PID: $CONTROL_PLANE_PID)"

# Start restart watcher in background (runs as root to manage processes)
echo "[$(date -Iseconds)] Starting restart watcher..."
/app/scripts/watch-restart.sh &

# Wait for control plane to be ready
for i in {1..30}; do
    if curl -s http://localhost:${CONTROL_PLANE_PORT:-3001}/health > /dev/null 2>&1; then
        echo "[$(date -Iseconds)] Control plane is ready"
        break
    fi
    sleep 1
done

# Monitor control plane health and restart if crashed (also keeps container alive)
echo "[$(date -Iseconds)] Singularity Agent ready. Starting health monitor..."
echo "[$(date -Iseconds)] Control Plane: http://localhost:${CONTROL_PLANE_PORT:-3001}"

HEALTH_CHECK_INTERVAL=600  # 10 minutes
HEALTH_URL="http://localhost:${CONTROL_PLANE_PORT:-3001}/health"

while true; do
    sleep $HEALTH_CHECK_INTERVAL
    if ! curl -sf "$HEALTH_URL" > /dev/null 2>&1; then
        echo "[$(date -Iseconds)] Control plane health check failed, restarting..."
        # Kill any leftover node processes (control plane)
        pkill -f "node.*control-plane/dist" 2>/dev/null || true
        pkill -f "node server.js" 2>/dev/null || true
        sleep 2
        # Restart control plane as agent user
        su -s /bin/bash agent -c "HOME=/home/agent node /app/packages/control-plane/dist/index.js" &
        # Wait for it to come back
        for i in $(seq 1 30); do
            if curl -sf "$HEALTH_URL" > /dev/null 2>&1; then
                echo "[$(date -Iseconds)] Control plane recovered successfully"
                break
            fi
            sleep 1
        done
        if ! curl -sf "$HEALTH_URL" > /dev/null 2>&1; then
            echo "[$(date -Iseconds)] WARNING: Control plane failed to recover"
        fi
    fi
done
