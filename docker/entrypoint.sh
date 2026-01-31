#!/bin/bash
# Singularity Agent Entrypoint
# Initializes state and starts cron daemon

set -e

echo "[$(date -Iseconds)] Singularity Agent starting..."

# Ensure directories exist with proper permissions
mkdir -p /app/agent/memory
mkdir -p /app/logs/agent-output
mkdir -p /app/state
chown -R agent:agent /app/agent /app/logs /app/state

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

# Initialize HEARTBEAT.md if not exists
if [ ! -f /app/agent/HEARTBEAT.md ]; then
    cat > /app/agent/HEARTBEAT.md << 'EOF'
# Agent Heartbeat Tasks

Add tasks here for the agent to process on each heartbeat.
Empty this file or leave only comments to skip processing.

## Tasks

_No tasks pending._
EOF
    chown agent:agent /app/agent/HEARTBEAT.md
    echo "[$(date -Iseconds)] Created initial HEARTBEAT.md"
fi

# Initialize run history if not exists
if [ ! -f /app/state/run-history.jsonl ]; then
    touch /app/state/run-history.jsonl
    chown agent:agent /app/state/run-history.jsonl
fi

# Pre-download embedding model (runs as agent user)
echo "[$(date -Iseconds)] Ensuring embedding model is downloaded..."
su - agent -c "cd /app && /app/venv/bin/python3 -c \"from sentence_transformers import SentenceTransformer; SentenceTransformer('${EMBEDDING_MODEL:-all-MiniLM-L6-v2}')\"" 2>/dev/null || true

# Set up environment for cron jobs
printenv | grep -E '^(AGENT_|TZ|EMBEDDING_|PATH|HOME)' > /etc/environment

# Start cron daemon
echo "[$(date -Iseconds)] Starting cron daemon..."
cron

# Keep container running and show logs
echo "[$(date -Iseconds)] Singularity Agent ready. Tailing logs..."
tail -f /app/logs/heartbeat.log 2>/dev/null || tail -f /dev/null
