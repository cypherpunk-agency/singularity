# Observability

Tools and endpoints for debugging and monitoring agent runs.

## Input Logging

Every agent run saves the **full context sent to Claude** before execution:

```
logs/agent-input/
└── 20260201-214301-input.md
```

Each file contains:

```markdown
# Agent Run Input
**Run ID:** 20260201-214301
**Type:** chat
**Channel:** web
**Timestamp:** 2026-02-01T21:43:01+00:00

## System Prompt
[Full SOUL.md + CONVERSATION.md content]

## Recent Conversation (web)
[21:43:01] Human: Testing per-channel architecture after rebuild!

## Cross-Session Memory
[MEMORY.md content]

## Current Tasks
[TASKS.md content]

## User Prompt
Process the incoming message and respond via the API.
```

This lets you see exactly what context the agent received.

## Run History

Each run logs detailed metadata to `state/run-history.jsonl`:

```json
{
  "runId": "20260201-214301",
  "timestamp": "2026-02-01T21:43:01+00:00",
  "type": "chat",
  "channel": "web",
  "prompt": "Process the incoming message...",
  "duration_seconds": 28,
  "exit_code": 0,
  "cost_usd": 0.0976,
  "inputFile": "/app/logs/agent-input/20260201-214301-input.md",
  "outputFile": "/app/logs/agent-output/20260201-214301.json",
  "readableFile": "/app/logs/agent-output/20260201-214301.md"
}
```

## Debug API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/debug/conversations` | View recent messages across all channels |
| `GET /api/debug/conversations/:channel` | View messages for a specific channel (web/telegram) |
| `GET /api/debug/runs` | List recent agent runs with metadata |
| `GET /api/debug/runs/:id` | Get full run details including input/output content |
| `GET /api/debug/runs/:id/input` | Get just the input context (markdown) |
| `GET /api/debug/runs/:id/output` | Get just the output (markdown) |

### Examples

```bash
# View recent runs
curl http://localhost:3001/api/debug/runs | jq

# View a specific run with full context
curl http://localhost:3001/api/debug/runs/20260201-214301 | jq

# View just the input that was sent to Claude
curl http://localhost:3001/api/debug/runs/20260201-214301/input

# View just the output
curl http://localhost:3001/api/debug/runs/20260201-214301/output

# View conversations by channel
curl http://localhost:3001/api/debug/conversations/web | jq

# View all recent conversations
curl http://localhost:3001/api/debug/conversations | jq
```

## Per-Channel Conversation Files

Conversations are organized by channel:

```
agent/conversation/
├── web/
│   └── 2026-02-01.jsonl       # Web chat messages
└── telegram/
    └── 2026-02-01.jsonl       # Telegram messages
```

Each line is a JSON message:

```json
{"id":"abc123","text":"Hello!","from":"human","channel":"web","timestamp":"2026-02-01T21:43:01Z"}
{"id":"def456","text":"Hi there!","from":"agent","channel":"web","timestamp":"2026-02-01T21:43:30Z"}
```

## Quick Debugging Workflow

1. **Something went wrong?** Check the latest run:
   ```bash
   curl http://localhost:3001/api/debug/runs | jq '.[0]'
   ```

2. **What did the agent see?** Check the input:
   ```bash
   curl http://localhost:3001/api/debug/runs/RUN_ID/input
   ```

3. **What did it do?** Check the output:
   ```bash
   curl http://localhost:3001/api/debug/runs/RUN_ID/output
   ```

4. **Check conversation flow:**
   ```bash
   curl http://localhost:3001/api/debug/conversations/web | jq '.messages[-5:]'
   ```

## Docker Commands

```bash
# View raw run history
docker exec singularity-agent bash -c "tail -5 /app/state/run-history.jsonl | jq"

# View recent input logs
docker exec singularity-agent bash -c "ls -la /app/logs/agent-input/ | tail -5"

# View specific input
docker exec singularity-agent bash -c "cat /app/logs/agent-input/RUN_ID-input.md"

# View web conversation
docker exec singularity-agent bash -c "tail -10 /app/agent/conversation/web/$(date +%Y-%m-%d).jsonl"

# Check if agent is running
docker exec singularity-agent bash -c "flock -n /app/state/agent.lock -c 'echo Idle' || echo 'Running'"
```

## Log Directory Structure

```
logs/
├── agent-input/              # Full context sent to Claude
│   └── YYYYMMDD-HHMMSS-input.md
├── agent-output/             # Claude responses
│   ├── YYYYMMDD-HHMMSS.json  # Raw JSON output
│   └── YYYYMMDD-HHMMSS.md    # Formatted markdown
└── heartbeat.log             # General container logs
```
