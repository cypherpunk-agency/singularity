#!/bin/bash
# Singularity Agent Runner
# Unified script for heartbeat and regular agent calls
#
# Usage:
#   run-agent.sh              # Heartbeat mode: SOUL + HEARTBEAT + "Begin heartbeat."
#   run-agent.sh "prompt"     # Regular mode: SOUL only + custom prompt

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="/app"
CONFIG_DIR="${APP_DIR}/config"
STATE_DIR="${APP_DIR}/state"
LOGS_DIR="${APP_DIR}/logs"
CONVERSATION_DIR="${APP_DIR}/agent/conversation"

SOUL_FILE="${CONFIG_DIR}/SOUL.md"
HEARTBEAT_FILE="${CONFIG_DIR}/HEARTBEAT.md"
SESSION_FILE="${STATE_DIR}/session-id.txt"
HISTORY_FILE="${STATE_DIR}/run-history.jsonl"

# Model configuration
MODEL="${AGENT_MODEL:-sonnet}"

# Determine mode based on arguments
PROMPT="${1:-}"
if [ -n "$PROMPT" ]; then
    MODE="regular"
else
    MODE="heartbeat"
fi

# Logging functions
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

# Build the system prompt from config files
build_system_prompt() {
    local prompt=""

    # Always include SOUL.md
    if [ -f "$SOUL_FILE" ]; then
        prompt=$(cat "$SOUL_FILE")
    fi

    # Only include HEARTBEAT.md for heartbeat mode
    if [ "$MODE" = "heartbeat" ] && [ -f "$HEARTBEAT_FILE" ]; then
        prompt="${prompt}

$(cat "$HEARTBEAT_FILE")"
    fi

    echo "$prompt"
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

# Ensure directories exist
ensure_dirs() {
    mkdir -p "$CONVERSATION_DIR"
    mkdir -p "${LOGS_DIR}/agent-output"
    mkdir -p "$STATE_DIR"
}

# Main execution
main() {
    ensure_dirs

    # Load session ID
    local session_id=""
    if [ -f "$SESSION_FILE" ]; then
        session_id=$(cat "$SESSION_FILE")
    fi

    log_header "SINGULARITY AGENT RUN ($MODE)"

    log_section "Configuration"
    log_kv "Mode" "$MODE"
    log_kv "Session" "${session_id:0:8}..."
    log_kv "Model" "$MODEL"
    log_kv "Working Dir" "$APP_DIR"

    # Build system prompt
    local system_prompt
    system_prompt=$(build_system_prompt)

    # User prompt - default to "Begin heartbeat." for heartbeat mode
    local user_prompt="${PROMPT:-Begin heartbeat.}"
    log_kv "Prompt" "${user_prompt:0:50}$([ ${#user_prompt} -gt 50 ] && echo '...')"

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

    # Run Claude CLI and pipe through stream processor
    if claude \
        -p \
        --verbose \
        --output-format stream-json \
        --model "$MODEL" \
        --append-system-prompt "$system_prompt" \
        --allowedTools "Bash(git:*) Edit Read Write Glob Grep" \
        --dangerously-skip-permissions \
        "$user_prompt" 2>&1 | "${SCRIPT_DIR}/stream-to-md.sh" "$readable_file" "$output_file"; then
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
        --arg mode "$MODE" \
        --arg prompt "$user_prompt" \
        --argjson duration "$duration" \
        --argjson exit_code "$exit_code" \
        --argjson cost "$cost" \
        --arg output_file "$output_file" \
        '{
            timestamp: $ts,
            session_id: $session,
            mode: $mode,
            prompt: $prompt,
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
