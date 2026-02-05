#!/bin/bash
# Singularity Agent Runner
# Unified script for heartbeat/cron and chat agent calls
#
# Usage:
#   run-agent.sh --type cron                    # Cron mode: SOUL + HEARTBEAT
#   run-agent.sh --type chat --channel web      # Chat mode: SOUL + CONVERSATION + history
#   run-agent.sh --type chat --channel telegram # Chat mode for telegram
#
# Note: Serialization is handled by the queue system in the control plane.
# This script is invoked by the queue worker, which ensures only one run at a time.

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="/app"
CONFIG_DIR="${APP_DIR}/agent/context"
AGENT_DIR="${APP_DIR}/agent"
STATE_DIR="${APP_DIR}/state"
LOGS_DIR="${APP_DIR}/logs"

SOUL_FILE="${CONFIG_DIR}/SOUL.md"
HEARTBEAT_FILE="${CONFIG_DIR}/HEARTBEAT.md"
CONVERSATION_FILE="${CONFIG_DIR}/CONVERSATION.md"
SESSION_FILE="${STATE_DIR}/session-id.txt"
HISTORY_FILE="${STATE_DIR}/run-history.jsonl"

# Model configuration
MODEL="${AGENT_MODEL:-sonnet}"

# Ensure state directory exists
mkdir -p "$STATE_DIR"

# Parse arguments
TYPE="chat"
CHANNEL=""
CUSTOM_PROMPT=""
SYSTEM_PROMPT_FILE=""
USER_PROMPT_OVERRIDE=""
RUN_ID_OVERRIDE=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --type)
            TYPE="$2"
            shift 2
            ;;
        --channel)
            CHANNEL="$2"
            shift 2
            ;;
        --prompt)
            CUSTOM_PROMPT="$2"
            shift 2
            ;;
        --system-prompt-file)
            SYSTEM_PROMPT_FILE="$2"
            shift 2
            ;;
        --user-prompt)
            USER_PROMPT_OVERRIDE="$2"
            shift 2
            ;;
        --run-id)
            RUN_ID_OVERRIDE="$2"
            shift 2
            ;;
        *)
            # Legacy: treat first positional arg as prompt
            if [[ -z "$CUSTOM_PROMPT" ]]; then
                CUSTOM_PROMPT="$1"
            fi
            shift
            ;;
    esac
done

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

    # 1. SOUL.md (always)
    if [ -f "$SOUL_FILE" ]; then
        prompt=$(cat "$SOUL_FILE")
    fi

    # 2. SYSTEM.md (always)
    if [ -f "${CONFIG_DIR}/SYSTEM.md" ]; then
        prompt="${prompt}

$(cat "${CONFIG_DIR}/SYSTEM.md")"
    fi

    # 3. OPERATIONS.md (always)
    if [ -f "${CONFIG_DIR}/OPERATIONS.md" ]; then
        prompt="${prompt}

$(cat "${CONFIG_DIR}/OPERATIONS.md")"
    fi

    # 4. PROJECTS.md (always)
    if [ -f "${AGENT_DIR}/operations/PROJECTS.md" ]; then
        prompt="${prompt}

## Projects Directory
$(cat "${AGENT_DIR}/operations/PROJECTS.md")"
    fi

    # 5. MEMORY.md (always)
    if [ -f "${AGENT_DIR}/operations/MEMORY.md" ]; then
        prompt="${prompt}

## Cross-Session Memory
$(cat "${AGENT_DIR}/operations/MEMORY.md")"
    fi

    # 6. Mode-specific instructions
    if [[ "$TYPE" == "cron" ]]; then
        # Cron mode: HEARTBEAT.md
        if [ -f "$HEARTBEAT_FILE" ]; then
            prompt="${prompt}

$(cat "$HEARTBEAT_FILE")"
        fi
    else
        # Chat mode: CONVERSATION.md
        if [ -f "$CONVERSATION_FILE" ]; then
            prompt="${prompt}

$(cat "$CONVERSATION_FILE")"
        fi

        # 7. Channel-specific instructions (e.g., TELEGRAM.md, WEB.md)
        if [[ -n "$CHANNEL" ]]; then
            local channel_config="${CONFIG_DIR}/${CHANNEL^^}.md"
            if [ -f "$channel_config" ]; then
                prompt="${prompt}

$(cat "$channel_config")"
            fi
        fi

        # 8. Conversation history
        if [[ -n "$CHANNEL" ]]; then
            local conv_dir="${AGENT_DIR}/conversation/${CHANNEL}"
            local today=$(date +%Y-%m-%d)
            local conv_file="${conv_dir}/${today}.jsonl"

            prompt="${prompt}

## Recent Conversation (${CHANNEL})"

            if [[ -f "$conv_file" ]]; then
                # Get last 30 messages and format them
                local history=""
                history=$(tail -30 "$conv_file" 2>/dev/null | while IFS= read -r line; do
                    local from=$(echo "$line" | jq -r '.from // "unknown"' 2>/dev/null)
                    local text=$(echo "$line" | jq -r '.text // ""' 2>/dev/null)
                    local ts=$(echo "$line" | jq -r '.timestamp // ""' 2>/dev/null)
                    local time=$(echo "$ts" | cut -d'T' -f2 | cut -d'.' -f1 2>/dev/null || echo "")
                    local role=$([[ "$from" == "human" ]] && echo "Human" || echo "Agent")
                    echo "[${time}] ${role}: ${text}"
                done)

                if [[ -n "$history" ]]; then
                    prompt="${prompt}
${history}"
                else
                    prompt="${prompt}
No previous messages in this conversation."
                fi
            else
                prompt="${prompt}
No previous messages in this conversation."
            fi

            prompt="${prompt}

**Channel:** ${CHANNEL}"
        fi
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
    mkdir -p "${AGENT_DIR}/conversation/web"
    mkdir -p "${AGENT_DIR}/conversation/telegram"
    mkdir -p "${LOGS_DIR}/agent-output"
    mkdir -p "${LOGS_DIR}/agent-input"
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

    # Use provided run ID or generate one
    local run_id
    if [[ -n "$RUN_ID_OVERRIDE" ]]; then
        run_id="$RUN_ID_OVERRIDE"
    else
        run_id=$(date +%Y%m%d-%H%M%S)
    fi

    log_header "SINGULARITY AGENT RUN (${TYPE}${CHANNEL:+:$CHANNEL})"

    log_section "Configuration"
    log_kv "Run ID" "$run_id"
    log_kv "Type" "$TYPE"
    log_kv "Channel" "${CHANNEL:-N/A}"
    log_kv "Session" "${session_id:0:8}..."
    log_kv "Model" "$MODEL"
    log_kv "Working Dir" "$APP_DIR"

    # Build or use pre-prepared system prompt
    local system_prompt
    if [[ -n "$SYSTEM_PROMPT_FILE" && -f "$SYSTEM_PROMPT_FILE" ]]; then
        log "Using pre-prepared system prompt from: $SYSTEM_PROMPT_FILE"
        system_prompt=$(cat "$SYSTEM_PROMPT_FILE")
    else
        system_prompt=$(build_system_prompt)
    fi

    # Determine user prompt
    local user_prompt
    if [[ -n "$USER_PROMPT_OVERRIDE" ]]; then
        user_prompt="$USER_PROMPT_OVERRIDE"
    elif [[ -n "$CUSTOM_PROMPT" ]]; then
        user_prompt="$CUSTOM_PROMPT"
    elif [[ "$TYPE" == "cron" ]]; then
        user_prompt="Begin heartbeat."
    else
        user_prompt="Process the incoming message and respond via the API."
    fi

    log_kv "Prompt" "${user_prompt:0:50}$([ ${#user_prompt} -gt 50 ] && echo '...')"

    # Save input for debugging
    local input_log_dir="${LOGS_DIR}/agent-input"
    local input_log_file="${input_log_dir}/${run_id}-input.md"

    cat > "$input_log_file" << EOF
# Agent Run Input
**Run ID:** ${run_id}
**Type:** ${TYPE}
**Channel:** ${CHANNEL:-N/A}
**Timestamp:** $(date -Iseconds)

## System Prompt
${system_prompt}

## User Prompt
${user_prompt}
EOF

    log "Input logged to: $input_log_file"

    # Run the agent
    local start_time
    start_time=$(date +%s)

    local output_file="${LOGS_DIR}/agent-output/${run_id}.json"
    local readable_file="${LOGS_DIR}/agent-output/${run_id}.md"
    local exit_code=0

    log_section "Execution"
    log "Starting agent..."
    log "Live output: $readable_file"

    # Create a temp file for the system prompt
    local system_prompt_file
    system_prompt_file=$(mktemp)
    echo "$system_prompt" > "$system_prompt_file"

    # Run Claude CLI and pipe through stream processor
    if claude \
        -p \
        --verbose \
        --output-format stream-json \
        --model "$MODEL" \
        --append-system-prompt "$(cat "$system_prompt_file")" \
        --allowedTools "Bash(git:*) Bash(curl:*) Edit Read Write Glob Grep" \
        --dangerously-skip-permissions \
        "$user_prompt" 2>&1 | "${SCRIPT_DIR}/stream-to-md.sh" "$readable_file" "$output_file"; then
        exit_code=0
    else
        exit_code=$?
    fi

    rm -f "$system_prompt_file"

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
        --arg run_id "$run_id" \
        --arg ts "$(date -Iseconds)" \
        --arg session "$session_id" \
        --arg type "$TYPE" \
        --arg channel "$CHANNEL" \
        --arg prompt "$user_prompt" \
        --argjson duration "$duration" \
        --argjson exit_code "$exit_code" \
        --argjson cost "$cost" \
        --arg input_file "$input_log_file" \
        --arg output_file "$output_file" \
        --arg readable_file "$readable_file" \
        '{
            runId: $run_id,
            timestamp: $ts,
            session_id: $session,
            type: $type,
            channel: (if $channel == "" then null else $channel end),
            prompt: $prompt,
            duration_seconds: $duration,
            exit_code: $exit_code,
            cost_usd: $cost,
            inputFile: $input_file,
            outputFile: $output_file,
            readableFile: $readable_file
        }'
    )

    echo "$history_entry" >> "$HISTORY_FILE"

    log_section "Complete"
    log_kv "Total time" "${duration}s"
    log_kv "Input log" "$input_log_file"
    log_kv "JSON output" "$output_file"
    log_kv "Readable" "$readable_file"
    echo ""
}

main "$@"
