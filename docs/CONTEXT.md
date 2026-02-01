# Context Preparation System

The context preparation system intelligently assembles context for agent runs, using vector search to find relevant memory and token budgeting to stay within limits.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Context Preparation Service                       │
│                 /api/agent/context endpoint                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Inputs:                      │  Context Assembly:                   │
│  ┌─────────────────────────┐  │  ┌─────────────────────────────┐    │
│  │ type: chat | cron       │  │  │ 1. SOUL.md (always)         │    │
│  │ channel: web | telegram │  │  │ 2. CONVERSATION.md/HEARTBEAT│    │
│  │ query: last user message│──┼─►│ 3. Conversation history     │    │
│  └─────────────────────────┘  │  │ 4. Relevant memory snippets │    │
│                               │  │ 5. TASKS.md                  │    │
│  Token Budget: ~8000 tokens   │  └─────────────────────────────┘    │
│                               │                                      │
└───────────────────────────────┴──────────────────────────────────────┘
                                       │
        ┌──────────────────────────────┼───────────────────────────────┐
        ▼                              ▼                               ▼
┌───────────────┐           ┌─────────────────────┐          ┌────────────────┐
│ Conversation  │           │   Vector Search     │          │  Static Files  │
│ History       │           │   (memory snippets) │          │                │
├───────────────┤           ├─────────────────────┤          ├────────────────┤
│ web/*.jsonl   │           │ MEMORY.md           │          │ SOUL.md        │
│ telegram/*.   │           │ memory/*.md         │          │ CONVERSATION.md│
│ (last N msgs, │           │ (semantic search    │          │ HEARTBEAT.md   │
│  cross-day)   │           │  by user query)     │          │ TASKS.md       │
└───────────────┘           └─────────────────────┘          └────────────────┘
```

## Token Budgets

| Component | Priority | Default Budget | Notes |
|-----------|----------|----------------|-------|
| SOUL.md | Required | ~500 tokens | Core identity |
| CONVERSATION/HEARTBEAT.md | Required | ~300 tokens | Mode instructions |
| Conversation History | High | ~2000 tokens | Last 20-30 messages |
| Relevant Memory | Medium | ~1500 tokens | Vector search results |
| TASKS.md | Medium | ~500 tokens | Current tasks |
| **Total** | | **~5300** | Buffer for response |

## API Reference

### GET /api/agent/context

Prepare context for an agent run without triggering execution.

**Query Parameters:**
- `type` - Run type: `chat` or `cron` (default: `chat`)
- `channel` - Channel for chat runs: `web` or `telegram` (default: `web`)
- `query` - User message for vector search relevance
- `tokenBudget` - Max tokens for context (default: 8000)

**Response:**
```json
{
  "systemPrompt": "...",
  "userPrompt": "Process the incoming message and respond via the API.",
  "metadata": {
    "totalTokensEstimate": 3250,
    "memorySnippetsIncluded": 3,
    "conversationMessagesIncluded": 15,
    "vectorSearchUsed": true,
    "components": {
      "soul": 450,
      "modeInstructions": 280,
      "conversationHistory": 1200,
      "relevantMemory": 820,
      "tasks": 500
    }
  }
}
```

### POST /api/agent/run

Trigger agent run with intelligent context preparation.

**Request Body:**
```json
{
  "type": "chat",
  "channel": "web",
  "prompt": "Optional custom prompt"
}
```

## Key Features

### 1. Vector Search Integration

When a user message is provided as `query`, the system queries the vector service to find relevant memory snippets:

```bash
# Vector service endpoint
curl "http://vector:5000/search?q=your+query&limit=5"
```

Results are deduplicated and formatted with source attribution.

### 2. Cross-Day Conversation History

Conversation history now spans multiple days for continuity:
- Reads today's conversation file
- If more messages needed, reads yesterday's file
- Token-aware truncation keeps most recent messages

### 3. Token-Aware Truncation

All context components are budget-aware:
- Estimates tokens using character count heuristic (~4 chars/token)
- Truncates oldest content first
- Preserves most recent/relevant information

### 4. Graceful Fallback

If vector service is unavailable:
- Falls back to including full MEMORY.md
- Logs warning but continues operation

## Module Structure

```
packages/control-plane/src/context/
├── index.ts          # Module exports
├── prepare.ts        # Main context preparation logic
├── memory-search.ts  # Vector search integration
└── tokens.ts         # Token estimation utilities
```

## Usage Examples

### Testing Context Preparation

```bash
# Get context for a chat message
curl "http://localhost:3001/api/agent/context?type=chat&channel=web&query=hello"

# Get context for a cron run
curl "http://localhost:3001/api/agent/context?type=cron"

# With custom token budget
curl "http://localhost:3001/api/agent/context?type=chat&channel=web&query=test&tokenBudget=4000"
```

### Verifying Vector Search

```bash
# Check vector service health
curl http://localhost:5000/health

# Test vector search directly
curl "http://localhost:5000/search?q=test+query&limit=3"
```

## Configuration

Environment variables:
- `VECTOR_SERVICE_URL` - Vector service endpoint (default: `http://vector:5000`)
- `APP_DIR` - Application base directory (default: `/app`)

## Integration with run-agent.sh

The shell script now accepts pre-prepared context:

```bash
# New arguments
--system-prompt-file <path>  # Path to pre-prepared system prompt
--user-prompt <text>         # Override user prompt

# Example
./run-agent.sh --type chat --channel web \
  --system-prompt-file /app/state/temp/context-123.txt \
  --user-prompt "Process the incoming message and respond via the API."
```

When `triggerAgentRun()` is called with `usePreparedContext: true` (default), it:
1. Calls `prepareContext()` to assemble intelligent context
2. Writes system prompt to temp file
3. Passes file path to run-agent.sh

## Vector Index Maintenance

The vector search index is stored in SQLite at `/app/state/memory.db`. It indexes:
- `agent/MEMORY.md` - Long-term memory
- `agent/memory/*.md` - Daily notes and implementation details

### Automatic Rebuild

A cron job rebuilds the index daily at 3:30 AM:
```
30 3 * * * curl -s -X POST http://vector:5000/index
```

### Manual Rebuild

Trigger a rebuild manually when you add or modify memory files:
```bash
# From host
curl -X POST http://localhost:5000/index

# From agent container
docker exec singularity-agent curl -s -X POST http://vector:5000/index
```

### Index Stats

Check what's indexed:
```bash
curl http://localhost:5000/stats
# Returns: {"chunks": 42, "files": 15}
```

### Troubleshooting

If vector search returns no results:
1. Check if index is empty: `curl http://localhost:5000/stats`
2. Rebuild index: `curl -X POST http://localhost:5000/index`
3. Verify vector service health: `curl http://localhost:5000/health`
