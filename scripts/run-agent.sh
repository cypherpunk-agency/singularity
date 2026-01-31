#!/bin/bash
# Singularity Agent Runner
# Invokes Claude Code CLI with proper context

set -e

# Configuration
APP_DIR="/app"
AGENT_DIR="${APP_DIR}/agent"
STATE_DIR="${APP_DIR}/state"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

MEMORY_FILE="${AGENT_DIR}/MEMORY.md"
HEARTBEAT_FILE="${AGENT_DIR}/HEARTBEAT.md"
MEMORY_DIR="${AGENT_DIR}/memory"

# Model configuration
MODEL="${AGENT_MODEL:-sonnet}"

# Get today's and yesterday's dates
TODAY=$(date +%Y-%m-%d)
YESTERDAY=$(date -d "yesterday" +%Y-%m-%d 2>/dev/null || date -v-1d +%Y-%m-%d 2>/dev/null || echo "")

# Build the system prompt
build_system_prompt() {
    cat << 'EOF'
You are Singularity, an autonomous agent running in a containerized environment.
You execute tasks from HEARTBEAT.md and maintain memory across sessions.

## Core Behaviors

1. **Task Execution**: Process tasks listed in HEARTBEAT.md
2. **Memory Management**:
   - Store permanent facts/preferences in MEMORY.md
   - Log session activities to memory/YYYY-MM-DD.md
3. **HEARTBEAT_OK**: If there are no actionable tasks or everything is already done, respond with just "HEARTBEAT_OK"

## Memory Guidelines

- **MEMORY.md**: Only add truly persistent information (preferences, important decisions, learned facts)
- **Daily logs**: Append activities, thoughts, and temporary notes to today's log file

## File Access

You have full access to:
- /app/agent/ - Your memory and task files
- /app/logs/ - Output logs
- /app/state/ - Session state

## Response Format

- Execute tasks thoroughly
- Update memory files as appropriate
- If no action needed, respond: HEARTBEAT_OK
EOF
}

# Build the main prompt with context
build_prompt() {
    echo "# Current Context"
    echo ""
    echo "Current time: $(date -Iseconds)"
    echo "Session ID: $(cat "${STATE_DIR}/session-id.txt" 2>/dev/null || echo 'unknown')"
    echo ""

    # Include long-term memory
    if [ -f "$MEMORY_FILE" ]; then
        echo "## Long-Term Memory (MEMORY.md)"
        echo ""
        cat "$MEMORY_FILE"
        echo ""
    fi

    # Include recent memory logs
    echo "## Recent Activity Logs"
    echo ""

    # Today's log
    local today_log="${MEMORY_DIR}/${TODAY}.md"
    if [ -f "$today_log" ]; then
        echo "### Today (${TODAY})"
        echo ""
        cat "$today_log"
        echo ""
    fi

    # Yesterday's log
    if [ -n "$YESTERDAY" ]; then
        local yesterday_log="${MEMORY_DIR}/${YESTERDAY}.md"
        if [ -f "$yesterday_log" ]; then
            echo "### Yesterday (${YESTERDAY})"
            echo ""
            cat "$yesterday_log"
            echo ""
        fi
    fi

    # Include heartbeat tasks
    echo "## Current Tasks (HEARTBEAT.md)"
    echo ""
    if [ -f "$HEARTBEAT_FILE" ]; then
        cat "$HEARTBEAT_FILE"
    else
        echo "_No heartbeat file found._"
    fi
    echo ""

    # Instructions
    echo "---"
    echo ""
    echo "Process the tasks above. Update memory files as needed."
    echo "If there are no actionable tasks, respond with: HEARTBEAT_OK"
}

# Ensure today's memory log exists
ensure_daily_log() {
    local log_file="${MEMORY_DIR}/${TODAY}.md"
    if [ ! -f "$log_file" ]; then
        mkdir -p "$MEMORY_DIR"
        cat > "$log_file" << EOF
# Activity Log: ${TODAY}

_Session started._

EOF
    fi
}

# Main execution
main() {
    ensure_daily_log

    local system_prompt
    system_prompt=$(build_system_prompt)

    local prompt
    prompt=$(build_prompt)

    # Run Claude CLI
    claude \
        -p \
        --output-format json \
        --model "$MODEL" \
        --append-system-prompt "$system_prompt" \
        --allowedTools "Bash(git:*) Edit Read Write Glob Grep" \
        --dangerously-skip-permissions \
        "$prompt"
}

main "$@"
