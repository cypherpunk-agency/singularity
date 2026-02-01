#!/bin/bash
# Singularity Heartbeat Script
# Main cron entry point - runs agent on each heartbeat

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="/app"
STATE_DIR="${APP_DIR}/state"
LOGS_DIR="${APP_DIR}/logs"

SESSION_FILE="${STATE_DIR}/session-id.txt"
HISTORY_FILE="${STATE_DIR}/run-history.jsonl"

# Logging
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

log_header() {
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  $1"
    echo "  $(date '+%Y-%m-%d %H:%M:%S')"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

log_section() {
    echo ""
    echo "── $1 ──"
}

log_kv() {
    printf "  %-16s %s\n" "$1:" "$2"
}

# Extract and display result summary from JSON output
log_result_summary() {
    local output_file="$1"
    local exit_code="$2"

    log_section "Result"

    if [ "$exit_code" -ne 0 ]; then
        log_kv "Status" "FAILED (exit code: $exit_code)"
        if [ -f "$output_file" ]; then
            echo ""
            echo "  Error output:"
            head -20 "$output_file" | sed 's/^/    /'
        fi
        return
    fi

    if [ ! -f "$output_file" ]; then
        log_kv "Status" "FAILED (no output file)"
        return
    fi

    # Parse JSON output
    local status duration cost result turns
    status=$(jq -r '.subtype // "unknown"' "$output_file" 2>/dev/null || echo "unknown")
    duration=$(jq -r '.duration_ms // 0' "$output_file" 2>/dev/null || echo "0")
    cost=$(jq -r '.total_cost_usd // 0' "$output_file" 2>/dev/null || echo "0")
    turns=$(jq -r '.num_turns // 0' "$output_file" 2>/dev/null || echo "0")
    result=$(jq -r '.result // "No result"' "$output_file" 2>/dev/null || echo "No result")

    # Format duration
    local duration_sec
    duration_sec=$(echo "scale=1; $duration / 1000" | bc 2>/dev/null || echo "$((duration / 1000))")

    # Format cost
    local cost_formatted
    cost_formatted=$(printf "%.4f" "$cost" 2>/dev/null || echo "$cost")

    log_kv "Status" "$status"
    log_kv "Duration" "${duration_sec}s"
    log_kv "Turns" "$turns"
    log_kv "Cost" "\$${cost_formatted}"

    echo ""
    echo "  Agent response:"
    echo "$result" | fold -s -w 70 | sed 's/^/    /'
}

# Main heartbeat logic
main() {
    log_header "SINGULARITY HEARTBEAT"

    # Load session ID
    local session_id=""
    if [ -f "$SESSION_FILE" ]; then
        session_id=$(cat "$SESSION_FILE")
    fi

    log_section "Configuration"
    log_kv "Session" "${session_id:0:8}..."
    log_kv "Model" "${AGENT_MODEL:-sonnet}"
    log_kv "Working Dir" "$APP_DIR"

    # Run the agent
    local start_time
    start_time=$(date +%s)

    local timestamp
    timestamp=$(date +%Y%m%d-%H%M%S)
    local output_file="${LOGS_DIR}/agent-output/${timestamp}.json"
    local readable_file="${LOGS_DIR}/agent-output/${timestamp}.md"
    local exit_code=0

    log_section "Execution"
    log "Starting agent..."
    log "Live output: $readable_file"

    # Pipe stream-json through processor for real-time markdown output
    if "${SCRIPT_DIR}/run-agent.sh" 2>&1 | "${SCRIPT_DIR}/stream-to-md.sh" "$readable_file" "$output_file"; then
        exit_code=0
    else
        exit_code=$?
    fi

    local end_time
    end_time=$(date +%s)
    local duration=$((end_time - start_time))

    # Display result summary
    log_result_summary "$output_file" "$exit_code"

    # Log run to history (compact JSON for machine parsing)
    local cost
    cost=$(jq -r '.total_cost_usd // 0' "$output_file" 2>/dev/null || echo "0")

    local history_entry
    history_entry=$(jq -n \
        --arg ts "$(date -Iseconds)" \
        --arg session "$session_id" \
        --argjson duration "$duration" \
        --argjson exit_code "$exit_code" \
        --argjson cost "$cost" \
        --arg output_file "$output_file" \
        '{
            timestamp: $ts,
            session_id: $session,
            duration_seconds: $duration,
            exit_code: $exit_code,
            cost_usd: $cost,
            output_file: $output_file
        }'
    )

    echo "$history_entry" >> "$HISTORY_FILE"

    log_section "Complete"
    log_kv "Total time" "${duration}s"
    log_kv "JSON output" "$output_file"
    log_kv "Readable" "$readable_file"
    echo ""
}

main "$@"
