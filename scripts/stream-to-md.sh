#!/bin/bash
# Stream-to-Markdown Processor
# Reads stream-json from stdin, writes human-readable .md and final .json

set -e

MD_FILE="$1"
JSON_FILE="$2"

if [ -z "$MD_FILE" ] || [ -z "$JSON_FILE" ]; then
    echo "Usage: $0 <markdown-file> <json-file>" >&2
    exit 1
fi

# Initialize markdown file with header
cat > "$MD_FILE" << EOF
# Agent Run: $(date '+%Y-%m-%d %H:%M:%S')

EOF

# Track state for formatting
last_type=""

# Process each line of NDJSON
while IFS= read -r line; do
    # Skip empty lines
    [ -z "$line" ] && continue

    # Extract the type field
    type=$(echo "$line" | jq -r '.type // empty' 2>/dev/null)
    [ -z "$type" ] && continue

    case "$type" in
        assistant)
            # Check if this contains tool_use or text content
            content_types=$(echo "$line" | jq -r '.message.content[]?.type // empty' 2>/dev/null)

            for content_type in $content_types; do
                if [ "$content_type" = "text" ]; then
                    # Extract text content
                    text=$(echo "$line" | jq -r '
                        .message.content[]? |
                        select(.type == "text") |
                        .text // empty
                    ' 2>/dev/null)

                    if [ -n "$text" ]; then
                        # Add spacing if coming from a different type
                        if [ "$last_type" != "assistant_text" ] && [ -n "$last_type" ]; then
                            echo "" >> "$MD_FILE"
                        fi
                        echo "$text" >> "$MD_FILE"
                        last_type="assistant_text"
                    fi
                elif [ "$content_type" = "tool_use" ]; then
                    # Extract tool use info from assistant message
                    tool_name=$(echo "$line" | jq -r '
                        .message.content[]? |
                        select(.type == "tool_use") |
                        .name // "unknown"
                    ' 2>/dev/null)
                    tool_input=$(echo "$line" | jq -r '
                        .message.content[]? |
                        select(.type == "tool_use") |
                        .input // {}
                    ' 2>/dev/null)

                    echo "" >> "$MD_FILE"
                    echo "> **Tool:** \`$tool_name\`" >> "$MD_FILE"

                    # Show relevant input details based on tool type
                    case "$tool_name" in
                        Read|Write|Edit)
                            file_path=$(echo "$tool_input" | jq -r '.file_path // empty' 2>/dev/null)
                            [ -n "$file_path" ] && echo "> File: \`$file_path\`" >> "$MD_FILE"
                            ;;
                        Bash)
                            command=$(echo "$tool_input" | jq -r '.command // empty' 2>/dev/null)
                            if [ -n "$command" ]; then
                                # Truncate long commands
                                if [ ${#command} -gt 100 ]; then
                                    command="${command:0:100}..."
                                fi
                                echo "> Command: \`$command\`" >> "$MD_FILE"
                            fi
                            ;;
                        Glob|Grep)
                            pattern=$(echo "$tool_input" | jq -r '.pattern // empty' 2>/dev/null)
                            [ -n "$pattern" ] && echo "> Pattern: \`$pattern\`" >> "$MD_FILE"
                            ;;
                    esac

                    echo "" >> "$MD_FILE"
                    last_type="tool_use"
                fi
            done
            ;;

        tool_result)
            # Optionally show brief tool results (skip for now to reduce noise)
            last_type="tool_result"
            ;;

        result)
            # Final result - save full JSON and append summary
            echo "$line" | jq '.' > "$JSON_FILE" 2>/dev/null

            # Extract summary info
            duration_ms=$(echo "$line" | jq -r '.duration_ms // 0' 2>/dev/null)
            cost=$(echo "$line" | jq -r '.total_cost_usd // 0' 2>/dev/null)
            turns=$(echo "$line" | jq -r '.num_turns // 0' 2>/dev/null)
            result_text=$(echo "$line" | jq -r '.result // "No result"' 2>/dev/null)
            subtype=$(echo "$line" | jq -r '.subtype // "unknown"' 2>/dev/null)

            # Calculate duration in seconds
            duration_sec=$(echo "scale=1; $duration_ms / 1000" | bc 2>/dev/null || echo "$((duration_ms / 1000))")

            # Format cost
            cost_formatted=$(printf "%.4f" "$cost" 2>/dev/null || echo "$cost")

            cat >> "$MD_FILE" << EOF

---

## Summary

| Metric | Value |
|--------|-------|
| Status | $subtype |
| Duration | ${duration_sec}s |
| Turns | $turns |
| Cost | \$${cost_formatted} |

### Result

$result_text
EOF
            last_type="result"
            ;;

        system)
            # System messages (usually initial context)
            last_type="system"
            ;;

        *)
            # Unknown type - ignore
            ;;
    esac
done

# If we never got a result message, create an empty JSON file
if [ ! -f "$JSON_FILE" ]; then
    echo '{"error": "No result received"}' > "$JSON_FILE"
fi
