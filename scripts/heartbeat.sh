#!/bin/bash
# Singularity Heartbeat Script
# Main cron entry point - checks for tasks and runs agent if needed

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="/app"
AGENT_DIR="${APP_DIR}/agent"
STATE_DIR="${APP_DIR}/state"
LOGS_DIR="${APP_DIR}/logs"

HEARTBEAT_FILE="${AGENT_DIR}/HEARTBEAT.md"
SESSION_FILE="${STATE_DIR}/session-id.txt"
HISTORY_FILE="${STATE_DIR}/run-history.jsonl"

# Timestamp for logging
timestamp() {
    date -Iseconds
}

log() {
    echo "[$(timestamp)] $1"
}

# Check if HEARTBEAT.md has actionable content
has_tasks() {
    if [ ! -f "$HEARTBEAT_FILE" ]; then
        return 1
    fi

    # Check if file has content beyond comments and empty lines
    # Also skip lines that only contain "_No tasks pending._" or similar
    local content
    content=$(grep -v '^#' "$HEARTBEAT_FILE" | grep -v '^$' | grep -v '^_.*_$' | grep -v '^\s*$' || true)

    if [ -z "$content" ]; then
        return 1
    fi

    return 0
}

# Main heartbeat logic
main() {
    log "=== Heartbeat starting ==="

    # Check for tasks
    if ! has_tasks; then
        log "No actionable tasks in HEARTBEAT.md - skipping run"
        exit 0
    fi

    log "Tasks found in HEARTBEAT.md - running agent"

    # Load session ID
    local session_id=""
    if [ -f "$SESSION_FILE" ]; then
        session_id=$(cat "$SESSION_FILE")
        log "Using session ID: ${session_id:0:8}..."
    fi

    # Run the agent
    local start_time
    start_time=$(date +%s)

    local output_file="${LOGS_DIR}/agent-output/$(date +%Y%m%d-%H%M%S).json"
    local exit_code=0

    if "${SCRIPT_DIR}/run-agent.sh" > "$output_file" 2>&1; then
        log "Agent run completed successfully"
    else
        exit_code=$?
        log "Agent run failed with exit code: $exit_code"
    fi

    local end_time
    end_time=$(date +%s)
    local duration=$((end_time - start_time))

    # Check for HEARTBEAT_OK response (nothing needed attention)
    local response_type="action"
    if grep -q "HEARTBEAT_OK" "$output_file" 2>/dev/null; then
        response_type="no_action"
        log "Agent responded with HEARTBEAT_OK - no action needed"
    fi

    # Log run to history
    local history_entry
    history_entry=$(jq -n \
        --arg ts "$(timestamp)" \
        --arg session "$session_id" \
        --arg duration "$duration" \
        --arg exit_code "$exit_code" \
        --arg response_type "$response_type" \
        --arg output_file "$output_file" \
        '{
            timestamp: $ts,
            session_id: $session,
            duration_seconds: ($duration | tonumber),
            exit_code: ($exit_code | tonumber),
            response_type: $response_type,
            output_file: $output_file
        }'
    )

    echo "$history_entry" >> "$HISTORY_FILE"
    log "Run logged to history"

    log "=== Heartbeat complete (${duration}s) ==="
}

main "$@"
