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

Run a heartbeat manually:
```bash
docker exec -u agent singularity-agent /app/scripts/heartbeat.sh
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
├── HEARTBEAT.md      # Agent guidance and goals
├── TASKS.md          # Pending/completed tasks (agent-managed)
├── MEMORY.md         # Long-term curated memory
├── INBOX.md          # Messages from humans (control center writes here)
├── memory/           # Daily activity logs
│   └── YYYY-MM-DD.md
└── conversation/     # Chat history
    └── YYYY-MM-DD.jsonl
```

### Interaction Model

- **Agent is autonomous**: Manages tasks in TASKS.md, guided by HEARTBEAT.md
- **Agent runs hourly** via cron (always runs, regardless of pending tasks)
- **Human communicates via chat** (Web UI or Telegram)
- **Messages queued in INBOX.md** for agent to process on next run
- **Agent responds via conversation log** which control center monitors

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
│  │          │  INBOX.md, TASKS.md, MEMORY.md   │                    │
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

## API Reference

### REST Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/chat` | Send message to agent |
| `GET` | `/api/chat/history` | Get conversation history |
| `GET` | `/api/files` | List workspace files |
| `GET` | `/api/files/:path` | Read file content |
| `PUT` | `/api/files/:path` | Update file content |
| `GET` | `/api/status` | Agent status |
| `POST` | `/api/agent/run` | Trigger immediate run |
| `GET` | `/api/outputs` | List agent outputs |
| `GET` | `/api/runs` | Get run history |

### WebSocket Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `file:changed` | Server→Client | File was modified |
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

## Schedule

- **Hourly** (minute 0): Run heartbeat, process tasks
- **Daily at 3:00 AM**: Consolidate old memory logs
- **Daily at 3:30 AM**: Rebuild vector search index

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
