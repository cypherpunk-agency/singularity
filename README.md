# Singularity

A containerized autonomous agent using Claude Code CLI headless mode, with a web-based control center.

## Quick Start

1. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env if needed
   ```

2. **Build the container:**
   ```bash
   docker-compose -f docker/docker-compose.yml build
   ```

3. **Start the agent:**
   ```bash
   docker-compose -f docker/docker-compose.yml up -d
   ```

4. **Login to Claude (first time only):**
   ```bash
   docker exec -it -u agent singularity-agent claude login
   ```

5. **Access the Control Center** at http://localhost:3001

6. **Chat with the agent** via the web UI or add tasks to `agent/TASKS.md`

## Control Center

The Control Center provides a web-based interface to interact with and monitor the agent.

### Features

- **Chat Interface**: Send messages to the agent via web or Telegram
- **File Browser**: View and edit agent files (HEARTBEAT.md, MEMORY.md, etc.)
- **Output Viewer**: See results from agent runs
- **Run History**: Track agent activity and costs
- **Real-time Updates**: WebSocket-powered live updates

### Access

- **Web UI**: http://localhost:3001 (or port specified in CONTROL_PLANE_PORT)
- **API**: http://localhost:3001/api
- **WebSocket**: ws://localhost:3001/ws
- **Health Check**: http://localhost:3001/health

### Telegram Integration (Optional)

1. Create a bot with @BotFather on Telegram
2. Get your chat ID by messaging the bot
3. Set environment variables:
   ```
   TELEGRAM_BOT_TOKEN=your-bot-token
   TELEGRAM_CHAT_ID=your-chat-id
   ```
4. Chat with your agent from anywhere via Telegram

## Manual Testing

Queue a heartbeat run:
```bash
curl -X POST http://localhost:3001/api/queue/enqueue -H 'Content-Type: application/json' -d '{"type":"cron"}'
```

Queue a chat run:
```bash
curl -X POST http://localhost:3001/api/queue/enqueue -H 'Content-Type: application/json' -d '{"type":"chat","channel":"web"}'
```

Check queue status:
```bash
curl http://localhost:3001/api/queue/status
```

Check logs:
```bash
docker logs singularity-agent
# or
cat logs/heartbeat.log
```

## Architecture

### File Structure

```
agent/
├── TASKS.md          # Pending/completed tasks (agent-managed)
├── MEMORY.md         # Long-term curated memory (cross-session)
├── config/           # Agent configuration (mutable)
│   ├── SOUL.md       # Core identity (all contexts)
│   ├── CONVERSATION.md # Chat-specific instructions
│   ├── HEARTBEAT.md  # Cron-specific instructions + heartbeat tasks
│   └── TOOLS.md      # Agent tools documentation
├── memory/           # Daily activity logs
│   └── YYYY-MM-DD.md
└── conversation/     # Per-channel chat history
    ├── web/
    │   └── YYYY-MM-DD.jsonl
    └── telegram/
        └── YYYY-MM-DD.jsonl

logs/
├── agent-input/      # Full context sent to Claude (for debugging)
│   └── YYYYMMDD-HHMMSS-input.md
├── agent-output/     # Claude responses
│   ├── YYYYMMDD-HHMMSS.json
│   └── YYYYMMDD-HHMMSS.md
└── heartbeat.log     # General logs
```

### Session Architecture

The agent uses per-channel sessions with cross-session memory:

| Context Type | System Prompt | History | Shared Memory |
|--------------|---------------|---------|---------------|
| Web chat | SOUL.md + CONVERSATION.md | conversation/web/ | MEMORY.md, TASKS.md |
| Telegram | SOUL.md + CONVERSATION.md | conversation/telegram/ | MEMORY.md, TASKS.md |
| Cron | SOUL.md + HEARTBEAT.md | None | MEMORY.md, TASKS.md |

All contexts share `MEMORY.md` and `TASKS.md` for cross-session continuity.

### Interaction Model

- **Agent is autonomous**: Manages tasks in TASKS.md, guided by HEARTBEAT.md
- **Agent runs on-demand** when messages arrive (also hourly via cron as fallback)
- **Human communicates via chat** (Web UI or Telegram)
- **Messages trigger immediate processing** (saved to channel conversation, agent starts automatically)
- **Agent responds via API** which broadcasts to WebSocket and sends to Telegram if needed

### Container Architecture

The system uses two containers for faster builds:

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Docker Compose                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────────────────────────────┐  ┌───────────────┐ │
│  │           Agent Container (fast build)       │  │    Vector     │ │
│  │                                              │  │   Container   │ │
│  │  ┌──────────────┐     ┌──────────────┐      │  │  (slow build) │ │
│  │  │   Web UI     │     │   Telegram   │      │  │               │ │
│  │  │   (React)    │     │   Bot        │      │  │  Python +     │ │
│  │  └───────┬──────┘     └───────┬──────┘      │  │  sentence-    │ │
│  │          └─────────┬──────────┘             │  │  transformers │ │
│  │          ┌─────────▼─────────┐              │  │               │ │
│  │          │  Control Plane    │──── HTTP ───►│  │  /search      │ │
│  │          │  (Node.js)        │              │  │  /index       │ │
│  │          │  Port 3001        │              │  │  /health      │ │
│  │          └─────────┬─────────┘              │  │               │ │
│  │                    │         ┌────────────┐ │  └───────────────┘ │
│  │                    │ trigger │ Agent Loop │ │                    │
│  │                    │────────►│ Claude CLI │ │                    │
│  │                    │         │ hourly cron│ │                    │
│  │          ┌─────────▼─────────┴────────────┘ │                    │
│  │          │         File System              │                    │
│  │          │  conversation/, TASKS.md, etc.   │                    │
│  │          └──────────────────────────────────┘                    │
│  └─────────────────────────────────────────────┘                    │
└─────────────────────────────────────────────────────────────────────┘
```

**Why two containers?**
- Agent container builds fast (~1 min) - just Node.js and Claude CLI
- Vector container is slow (~3 min) due to PyTorch, but rarely needs rebuilding
- Separation allows independent scaling and caching

### Scripts

- `scripts/heartbeat.sh` - Cron entry point
- `scripts/run-agent.sh` - Claude CLI wrapper with context assembly
- `scripts/memory-search.py` - Vector search service (HTTP/MCP/CLI modes)

### Memory System

Two-layer memory architecture:

1. **MEMORY.md**: Persistent facts, preferences, and decisions
2. **Daily logs**: Session activities and temporary notes

Vector search enables semantic retrieval across all memory files using local embeddings (no API keys required). The search runs in a separate container for faster agent container builds.

See [docs/CONTEXT.md](docs/CONTEXT.md) for details on intelligent context preparation.

## API Reference

### REST Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/chat` | Send message to agent (specify channel) |
| `POST` | `/api/chat/respond` | Agent sends response |
| `GET` | `/api/chat/history?channel=web` | Get channel conversation history |
| `GET` | `/api/chat/history/:date?channel=web` | Get conversation for specific date |
| `GET` | `/api/files` | List workspace files |
| `GET` | `/api/files/:path` | Read file content |
| `PUT` | `/api/files/:path` | Update file content |
| `GET` | `/api/files/search?q=query` | Vector search across memory files |
| `GET` | `/api/status` | Agent status |
| `POST` | `/api/agent/run` | Trigger immediate run |
| `GET` | `/api/agent/context` | Get prepared context without running agent |
| `GET` | `/api/outputs` | List agent outputs |
| `GET` | `/api/outputs/:id` | Get specific output file |
| `GET` | `/api/runs` | Get run history |
| `GET` | `/api/sessions` | List agent sessions |
| `GET` | `/api/sessions/:id` | Get full session with input/output |
| `GET` | `/api/debug/conversations` | View all recent conversations |
| `GET` | `/api/debug/conversations/:channel` | View channel conversations |
| `GET` | `/api/debug/runs` | View recent agent runs |
| `GET` | `/api/debug/runs/:id` | View specific run with full input/output |
| `POST` | `/api/queue/enqueue` | Add run to queue (returns queue ID) |
| `GET` | `/api/queue` | List pending runs |
| `GET` | `/api/queue/status` | Current queue status (pending count, processing run) |
| `GET` | `/api/queue/:id` | Get specific run status |

### WebSocket Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `file:changed` | Server→Client | File was modified |
| `file:created` | Server→Client | New file created |
| `file:deleted` | Server→Client | File deleted |
| `agent:started` | Server→Client | Agent run started |
| `agent:completed` | Server→Client | Agent run finished |
| `chat:received` | Server→Client | New chat message |

## Commands

### Vector Search Service

```bash
# Check vector service health
curl http://localhost:5000/health

# Rebuild vector index
curl -X POST http://localhost:5000/index

# Search memory
curl "http://localhost:5000/search?q=your+query&limit=5"

# Get index stats
curl http://localhost:5000/stats
```

Or via docker exec:
```bash
docker exec singularity-vector python memory-search.py index
docker exec singularity-vector python memory-search.py search "your query"
```

### Debug Commands

```bash
# View recent web conversations
curl http://localhost:3001/api/debug/conversations/web

# View recent agent runs
curl http://localhost:3001/api/debug/runs

# View specific run with full input/output
curl http://localhost:3001/api/debug/runs/20260201-123456

# View just the input for a run
curl http://localhost:3001/api/debug/runs/20260201-123456/input

# View just the output for a run
curl http://localhost:3001/api/debug/runs/20260201-123456/output
```

## Schedule

- **Hourly** (minute 0): Enqueue heartbeat via queue API (processed sequentially)
- **Daily at 3:30 AM**: Rebuild vector search index

All runs go through the queue to prevent concurrent execution. Chat runs have higher priority than cron runs.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENT_MODEL` | `sonnet` | Claude model (sonnet, opus, haiku) |
| `TZ` | `UTC` | Container timezone |
| `EMBEDDING_MODEL` | `all-MiniLM-L6-v2` | Local embedding model (vector service) |
| `CONTROL_PLANE_PORT` | `3001` | Control plane API port |
| `CONTROL_PLANE_TOKEN` | (empty) | Optional API auth token |
| `VECTOR_SERVICE_URL` | `http://vector:5000` | Vector search service URL |
| `TELEGRAM_BOT_TOKEN` | (empty) | Telegram bot token from @BotFather |
| `TELEGRAM_CHAT_ID` | (empty) | Your Telegram chat ID |

## Development

### Local Development (without Docker)

```bash
# Install dependencies
pnpm install

# Build shared types
pnpm --filter @singularity/shared build

# Run control plane in dev mode
pnpm --filter @singularity/control-plane dev

# Run UI in dev mode (separate terminal)
pnpm --filter @singularity/ui dev
```

### Project Structure

```
docker/
├── Dockerfile         # Agent container (Node.js, Claude CLI)
├── Dockerfile.vector  # Vector service (Python, sentence-transformers)
└── docker-compose.yml # Multi-container orchestration

packages/
├── shared/          # Shared types and constants
├── control-plane/   # Node.js control plane service
└── ui/              # React web dashboard
```

## License

MIT
