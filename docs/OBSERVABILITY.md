# Observability

Tools and endpoints for debugging and monitoring agent runs.

## Queue Monitoring

The system uses a **message-centric model**:
- **Chat runs**: Messages in JSONL ARE the queue (no queue entry)
- **Cron runs**: Traditional queue system via `state/queue.jsonl`

### Checking Queue Status

```bash
# Check queue status (cron runs only, plus recent completed)
curl http://localhost:3001/api/queue/status | jq

# List pending cron runs
curl http://localhost:3001/api/queue | jq

# Get specific queued run by ID
curl http://localhost:3001/api/queue/QUEUE_ID | jq
```

### Checking Unprocessed Messages (Chat)

Messages without `processedAt` are pending:

```bash
# View unprocessed messages (look for entries WITHOUT processedAt)
docker exec singularity-agent bash -c "tail -10 /app/agent/conversation/web/$(date +%Y-%m-%d).jsonl | jq 'select(.processedAt == null)'"

# Count unprocessed messages per channel
docker exec singularity-agent bash -c "cat /app/agent/conversation/telegram/$(date +%Y-%m-%d).jsonl 2>/dev/null | jq -s '[.[] | select(.from==\"human\" and .processedAt == null)] | length'"
```

### Queue Status Response

```json
{
  "pendingCount": 1,
  "processingRun": {
    "id": "abc-123",
    "type": "cron",
    "priority": 2,
    "status": "processing",
    "enqueuedAt": "2026-02-01T23:50:51Z",
    "startedAt": "2026-02-01T23:50:51Z",
    "runId": "20260201-235051"
  },
  "recentCompleted": [...]
}
```

**Note**: Chat runs no longer appear in `processingRun` - they're tracked via message `processedAt` timestamps.

### Queue File (Cron Only)

Cron runs persist in `state/queue.jsonl`:

```json
{"id":"abc-123","type":"cron","priority":2,"status":"completed","enqueuedAt":"...","startedAt":"...","completedAt":"...","runId":"20260201-235051"}
```

### Message Tracking (Chat)

Chat messages in `agent/conversation/{channel}/YYYY-MM-DD.jsonl`:

```json
{"id":"msg-1","text":"Hello","from":"human","channel":"web","timestamp":"..."}
{"id":"msg-2","text":"Hello","from":"human","channel":"web","timestamp":"...","processedAt":"2026-02-01T23:51:00Z"}
```

Messages with `processedAt` have been processed. Messages without are pending.

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

## Current Queue
[SINGULARITY_QUEUE.md content]

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
{"id":"abc123","text":"Hello!","from":"human","channel":"web","timestamp":"2026-02-01T21:43:01Z","processedAt":"2026-02-01T21:43:30Z"}
{"id":"def456","text":"Hi there!","from":"agent","channel":"web","timestamp":"2026-02-01T21:43:30Z"}
```

**Message tracking**: Human messages without `processedAt` are unprocessed. The worker polls for these and batches them into runs.

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

# Check if agent is running (only shows cron runs, chat runs are message-driven)
curl -s http://localhost:3001/api/queue/status | jq -r 'if .processingRun then "Running cron: \(.processingRun.runId)" else "No cron running" end'

# Check for unprocessed chat messages
docker exec singularity-agent bash -c "cat /app/agent/conversation/*/$(date +%Y-%m-%d).jsonl 2>/dev/null | jq -s '[.[] | select(.from==\"human\" and .processedAt == null)] | length' 2>/dev/null || echo 0"
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

state/
├── queue.jsonl               # Cron run queue (pending, processing, completed)
├── run-history.jsonl         # Completed run metadata
└── session-id.txt            # Current Claude session ID

agent/conversation/           # Chat message queue (message-centric)
├── web/
│   └── YYYY-MM-DD.jsonl      # Messages with optional processedAt
└── telegram/
    └── YYYY-MM-DD.jsonl      # Messages with optional processedAt
```
