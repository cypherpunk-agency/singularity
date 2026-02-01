#!/bin/bash
# Singularity Agent Runner
# Invokes Claude Code CLI with proper context

set -e

# Configuration
APP_DIR="/app"
CONFIG_DIR="${APP_DIR}/config"
CONVERSATION_DIR="${APP_DIR}/agent/conversation"

SOUL_FILE="${CONFIG_DIR}/SOUL.md"
HEARTBEAT_FILE="${CONFIG_DIR}/HEARTBEAT.md"

# Model configuration
MODEL="${AGENT_MODEL:-sonnet}"

# Build the system prompt from config files
build_system_prompt() {
    local prompt=""

    if [ -f "$SOUL_FILE" ]; then
        prompt=$(cat "$SOUL_FILE")
    fi

    if [ -f "$HEARTBEAT_FILE" ]; then
        prompt="${prompt}

$(cat "$HEARTBEAT_FILE")"
    fi

    echo "$prompt"
}

# Ensure conversation directory exists
ensure_conversation_dir() {
    mkdir -p "$CONVERSATION_DIR"
}

# Main execution
main() {
    ensure_conversation_dir

    local system_prompt
    system_prompt=$(build_system_prompt)

    # Simple prompt - agent discovers context via tools
    claude \
        -p \
        --verbose \
        --output-format stream-json \
        --model "$MODEL" \
        --append-system-prompt "$system_prompt" \
        --allowedTools "Bash(git:*) Edit Read Write Glob Grep" \
        --dangerously-skip-permissions \
        "Begin heartbeat."
}

main "$@"
