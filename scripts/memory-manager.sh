#!/bin/bash
# Singularity Memory Manager
# Utilities for managing agent memory files and vector search

set -e

# Configuration
APP_DIR="/app"
AGENT_DIR="${APP_DIR}/agent"
STATE_DIR="${APP_DIR}/state"
MEMORY_DIR="${AGENT_DIR}/memory"
MEMORY_DB="${STATE_DIR}/memory.db"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Timestamp for logging
timestamp() {
    date -Iseconds
}

log() {
    echo "[$(timestamp)] [memory-manager] $1"
}

# Initialize memory structure
cmd_init() {
    log "Initializing memory structure..."

    mkdir -p "$MEMORY_DIR"

    # Create MEMORY.md if not exists
    if [ ! -f "${AGENT_DIR}/MEMORY.md" ]; then
        cat > "${AGENT_DIR}/MEMORY.md" << 'EOF'
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
        log "Created MEMORY.md"
    fi

    # Create HEARTBEAT.md if not exists
    if [ ! -f "${AGENT_DIR}/HEARTBEAT.md" ]; then
        cat > "${AGENT_DIR}/HEARTBEAT.md" << 'EOF'
# Agent Heartbeat Tasks

Add tasks here for the agent to process on each heartbeat.
Empty this file or leave only comments to skip processing.

## Tasks

_No tasks pending._
EOF
        log "Created HEARTBEAT.md"
    fi

    # Create today's log
    local today=$(date +%Y-%m-%d)
    local today_log="${MEMORY_DIR}/${today}.md"
    if [ ! -f "$today_log" ]; then
        cat > "$today_log" << EOF
# Activity Log: ${today}

_Session initialized._

EOF
        log "Created today's log: ${today}.md"
    fi

    log "Memory structure initialized"
}

# Consolidate old memory logs
cmd_consolidate() {
    log "Consolidating memory logs..."

    local cutoff_date
    cutoff_date=$(date -d "7 days ago" +%Y-%m-%d 2>/dev/null || date -v-7d +%Y-%m-%d 2>/dev/null)

    if [ -z "$cutoff_date" ]; then
        log "Warning: Could not calculate cutoff date"
        return 1
    fi

    log "Archiving logs older than: $cutoff_date"

    local archive_dir="${MEMORY_DIR}/archive"
    mkdir -p "$archive_dir"

    local count=0
    for log_file in "${MEMORY_DIR}"/*.md; do
        [ -f "$log_file" ] || continue

        local basename
        basename=$(basename "$log_file" .md)

        # Skip non-date files
        if ! [[ $basename =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
            continue
        fi

        # Archive if older than cutoff
        if [[ "$basename" < "$cutoff_date" ]]; then
            mv "$log_file" "$archive_dir/"
            log "Archived: $basename.md"
            ((count++)) || true
        fi
    done

    log "Consolidated $count log files"

    # Compress old archives (older than 30 days)
    local compress_cutoff
    compress_cutoff=$(date -d "30 days ago" +%Y-%m-%d 2>/dev/null || date -v-30d +%Y-%m-%d 2>/dev/null)

    if [ -n "$compress_cutoff" ] && [ -d "$archive_dir" ]; then
        for archive_file in "${archive_dir}"/*.md; do
            [ -f "$archive_file" ] || continue

            local basename
            basename=$(basename "$archive_file" .md)

            if [[ "$basename" < "$compress_cutoff" ]] && [ ! -f "${archive_file}.gz" ]; then
                gzip "$archive_file"
                log "Compressed: $basename.md"
            fi
        done
    fi
}

# Rebuild vector search index
cmd_index() {
    log "Rebuilding vector search index..."

    # Run Python indexer
    if [ -f "${SCRIPT_DIR}/memory-search.py" ]; then
        /app/venv/bin/python3 "${SCRIPT_DIR}/memory-search.py" index
        log "Vector index rebuilt"
    else
        log "Warning: memory-search.py not found"
        return 1
    fi
}

# Search memory using vector search
cmd_search() {
    local query="$1"

    if [ -z "$query" ]; then
        echo "Usage: memory-manager.sh search <query>"
        return 1
    fi

    # Run Python search
    if [ -f "${SCRIPT_DIR}/memory-search.py" ]; then
        /app/venv/bin/python3 "${SCRIPT_DIR}/memory-search.py" search "$query"
    else
        log "Warning: memory-search.py not found, falling back to grep"
        grep -r -i "$query" "${AGENT_DIR}" || echo "No matches found"
    fi
}

# List all memory files
cmd_list() {
    echo "=== Memory Files ==="
    echo ""

    echo "Long-term memory:"
    if [ -f "${AGENT_DIR}/MEMORY.md" ]; then
        echo "  MEMORY.md ($(wc -l < "${AGENT_DIR}/MEMORY.md") lines)"
    fi

    echo ""
    echo "Daily logs:"
    for log_file in "${MEMORY_DIR}"/*.md; do
        [ -f "$log_file" ] || continue
        local basename
        basename=$(basename "$log_file")
        echo "  $basename ($(wc -l < "$log_file") lines)"
    done

    if [ -d "${MEMORY_DIR}/archive" ]; then
        local archive_count
        archive_count=$(find "${MEMORY_DIR}/archive" -type f | wc -l)
        echo ""
        echo "Archived: $archive_count files"
    fi

    if [ -f "$MEMORY_DB" ]; then
        echo ""
        echo "Vector DB: $(du -h "$MEMORY_DB" | cut -f1)"
    fi
}

# Show usage
usage() {
    cat << EOF
Singularity Memory Manager

Usage: memory-manager.sh <command> [args]

Commands:
  init        Initialize memory structure
  consolidate Archive logs older than 7 days
  index       Rebuild vector search index
  search      Search memory (usage: search <query>)
  list        List all memory files

EOF
}

# Main dispatch
main() {
    local cmd="${1:-}"
    shift || true

    case "$cmd" in
        init)
            cmd_init
            ;;
        consolidate)
            cmd_consolidate
            ;;
        index)
            cmd_index
            ;;
        search)
            cmd_search "$@"
            ;;
        list)
            cmd_list
            ;;
        *)
            usage
            exit 1
            ;;
    esac
}

main "$@"
