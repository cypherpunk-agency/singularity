# Singularity Developer Reference

## File Map

| Path | Purpose |
|------|---------|
| `packages/control-plane/src/index.ts` | Server entry, route registration, middleware |
| `packages/control-plane/src/api/chat.ts` | Chat endpoints, per-channel conversation |
| `packages/control-plane/src/api/files.ts` | File CRUD, path security, vector search |
| `packages/control-plane/src/api/agent.ts` | Status, trigger run, run history |
| `packages/control-plane/src/api/outputs.ts` | Agent output listing |
| `packages/control-plane/src/api/debug.ts` | Debug endpoints for viewing runs/conversations |
| `packages/control-plane/src/ws/events.ts` | WebSocket manager, event broadcasting |
| `packages/control-plane/src/watcher/files.ts` | File change detection, per-channel conversation parsing |
| `packages/control-plane/src/conversation.ts` | Per-channel conversation storage and retrieval |
| `packages/control-plane/src/channels/telegram.ts` | Telegram bot integration |
| `packages/control-plane/src/utils/agent.ts` | Agent triggering with channel/type support |
| `packages/control-plane/src/api/sessions.ts` | Session listing and retrieval |
| `packages/control-plane/src/api/queue.ts` | Queue visibility endpoints |
| `packages/control-plane/src/api/proxy.ts` | Generic proxy utility for internal APIs |
| `packages/control-plane/src/api/interview-proxy.ts` | Interview Prep API proxy |
| `packages/control-plane/src/api/jobs-proxy.ts` | Job Tracker API proxy |
| `packages/control-plane/src/queue/manager.ts` | Queue operations (enqueue, dequeue, complete) |
| `packages/control-plane/src/queue/worker.ts` | Sequential run processor |
| `packages/control-plane/src/queue/storage.ts` | JSONL queue persistence |
| `packages/control-plane/src/context/` | Intelligent context preparation module |
| `packages/control-plane/src/context/prepare.ts` | Main context assembly logic |
| `packages/control-plane/src/context/memory-search.ts` | Vector search integration |
| `packages/control-plane/src/context/tokens.ts` | Token estimation utilities |
| `packages/ui/src/components/Layout.tsx` | Main layout, nav items |
| `packages/ui/src/store.ts` | Zustand state |
| `packages/ui/src/lib/api.ts` | API client |
| `packages/shared/src/constants.ts` | Paths, WS events, API routes |
| `packages/shared/src/types.ts` | Shared types (Channel, RunType, Message, etc.) |
| `scripts/run-agent.sh` | Claude CLI invocation, context assembly |
| `agent/context/SOUL.md` | Core identity (all contexts) |
| `agent/context/CONVERSATION.md` | Chat-specific system prompt |
| `agent/context/HEARTBEAT.md` | Cron-specific system prompt + heartbeat tasks |

## Session Architecture

The agent uses **per-channel sessions** with **cross-session memory**:

```
┌─────────────────────────────────────────────────────────────────┐
│                     Shared Cross-Session Context                 │
│  agent/context/SOUL.md, MEMORY.md, TASKS_SINGULARITY.md          │
└─────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
 ┌─────────────┐       ┌─────────────┐       ┌──────────┐
 │     Web     │       │  Telegram   │       │   Cron   │
 │   Channel   │       │   Channel   │       │ (no hist)│
 └──────┬──────┘       └──────┬──────┘       └────┬─────┘
        │                     │                    │
 SOUL + CONV.md        SOUL + CONV.md        SOUL + HEARTBEAT
        │                     │                    │
 conversation/         conversation/          (fresh context)
   web/*.jsonl           telegram/*.jsonl
```

| Context Type | System Prompt | History | Shared Memory |
|--------------|---------------|---------|---------------|
| Web chat | SOUL.md + CONVERSATION.md | conversation/web/ | MEMORY.md, TASKS_SINGULARITY.md |
| Telegram | SOUL.md + CONVERSATION.md | conversation/telegram/ | MEMORY.md, TASKS_SINGULARITY.md |
| Cron | SOUL.md + HEARTBEAT.md | None | MEMORY.md, TASKS_SINGULARITY.md |

## API Reference

| Endpoint | Handler | Notes |
|----------|---------|-------|
| `POST /api/chat` | `api/chat.ts` | Saves to channel conversation, triggers agent |
| `POST /api/chat/respond` | `api/chat.ts` | Agent sends response, broadcasts + sends to telegram |
| `GET /api/chat/history` | `api/chat.ts` | Query: `channel`, `limit` |
| `GET /api/chat/history/:date` | `api/chat.ts` | Query: `channel` |
| `GET /api/files` | `api/files.ts` | Lists VIEWABLE_FILES + memory/*.md |
| `GET /api/files/*` | `api/files.ts` | Read file (path traversal check) |
| `PUT /api/files/*` | `api/files.ts` | Update file (blocks queue files) |
| `GET /api/files/search` | `api/files.ts` | Vector search via memory-search.py |
| `GET /api/status` | `api/agent.ts` | Lock file check, next run calc |
| `POST /api/agent/run` | `api/agent.ts` | Body: `{type, channel, prompt}` |
| `GET /api/agent/context` | `api/agent.ts` | Preview prepared context |
| `GET /api/runs` | `api/agent.ts` | Query: `limit` (default 50) |
| `GET /api/outputs` | `api/outputs.ts` | Query: `limit` (default 20) |
| `GET /api/outputs/:id` | `api/outputs.ts` | ID sanitized |
| `GET /api/sessions` | `api/sessions.ts` | Query: `limit` |
| `GET /api/sessions/:id` | `api/sessions.ts` | Full session with input/output |
| `GET /api/debug/conversations` | `api/debug.ts` | View all recent conversations |
| `GET /api/debug/conversations/:channel` | `api/debug.ts` | View channel conversations |
| `GET /api/debug/runs` | `api/debug.ts` | View recent agent runs |
| `GET /api/debug/runs/:id` | `api/debug.ts` | View run with full input/output |
| `GET /api/debug/runs/:id/input` | `api/debug.ts` | Get just the input |
| `GET /api/debug/runs/:id/output` | `api/debug.ts` | Get just the output |
| `POST /api/queue/enqueue` | `api/queue.ts` | Add run to queue, returns queue ID |
| `GET /api/queue` | `api/queue.ts` | List pending runs |
| `GET /api/queue/status` | `api/queue.ts` | Queue status (pending count, processing run) |
| `GET /api/queue/:id` | `api/queue.ts` | Get specific queued run |
| `GET /health` | `index.ts` | Health check |
| `ALL /api/interview/*` | `api/interview-proxy.ts` | Proxy to Interview Prep API (port 3003) |
| `ALL /api/jobs-backend/*` | `api/jobs-proxy.ts` | Proxy to Job Tracker API (port 3002) |

## WebSocket Events

| Event | Direction | Trigger |
|-------|-----------|---------|
| `file:changed` | S->C | File watcher detects change |
| `file:created` | S->C | New file created |
| `file:deleted` | S->C | File deleted |
| `agent:started` | S->C | Lock file created |
| `agent:completed` | S->C | run-history.jsonl updated |
| `chat:received` | S->C | New line in conversation/web/*.jsonl or conversation/telegram/*.jsonl |
| `chat:typing` | S->C | Not implemented |
| `chat:send` | C->S | Logged only; use REST |

## Data Flow

### Message-Centric Run System

The system uses a **message-centric model** for chat runs:

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Chat API   │────►│ Conversation│     │             │────►│  run-agent  │
│  Telegram   │     │   JSONL     │────►│   Worker    │     │    .sh      │
└─────────────┘     │ (messages)  │     │   polls     │────►│  Claude CLI │
                    └─────────────┘     │ unprocessed │     └─────────────┘
┌─────────────┐     ┌─────────────┐     │  messages   │
│  Cron       │────►│    Queue    │────►│             │
└─────────────┘     │   JSONL     │     └─────────────┘
                    └─────────────┘
                    state/queue.jsonl
```

**Chat runs**: Messages saved to JSONL ARE the queue. Worker polls for unprocessed messages.
**Cron runs**: Traditional queue system with `state/queue.jsonl`.
**Priority**: Messages (chat) always processed before queued cron runs.

### Chat Message Flow (Message-Centric)

1. Human sends message via UI/Telegram
2. `POST /api/chat` saves to `agent/conversation/{channel}/YYYY-MM-DD.jsonl` (no `processedAt`)
3. Worker notified via `notifyMessageArrived(channel)`
4. Worker polls `checkForUnprocessedMessages()` - checks telegram first, then web
5. Multiple rapid messages are batched into ONE run (no duplicates)
6. Worker spawns `run-agent.sh` with `--type chat --channel {channel}`
7. Claude CLI runs with `--dangerously-skip-permissions`
8. Agent calls `curl -X POST /api/chat/respond` to send response
9. Response saved to channel conversation, broadcast via WebSocket
10. If telegram channel, also sent to Telegram
11. Worker marks messages as processed (`processedAt` timestamp added to JSONL)
12. Worker checks for more unprocessed messages or queued cron runs

### Cron (Heartbeat) Flow (Queue-Based)

1. Cron calls `POST /api/queue/enqueue` with `type=cron`
2. Run enqueued in `state/queue.jsonl` with `priority=2`
3. Worker checks for unprocessed chat messages first (always prioritized)
4. If no messages, worker dequeues cron run
5. Worker prepares context and spawns `run-agent.sh`
6. Claude CLI runs with `--dangerously-skip-permissions`
7. Agent manages tasks, updates MEMORY.md, etc.
8. Worker marks run as completed in queue

## Key Patterns

- **Per-channel conversations**: `conversation.ts` - separate directories for web/telegram
- **Path security**: `api/files.ts` - normalize + startsWith check
- **Queue files protected**: `api/files.ts` - write blocked
- **Message-centric chat runs**: `queue/worker.ts` - polls for unprocessed messages, batches into ONE run
- **Queue-based cron runs**: `queue/worker.ts` - cron runs use traditional queue
- **Message priority**: Chat messages always processed before queued cron runs
- **ID sanitization**: `api/outputs.ts` - path.basename + regex
- **File cache dedup**: `watcher/files.ts` - skip unchanged content
- **Viewable files whitelist**: `api/files.ts`
- **Run history append-only**: `state/run-history.jsonl` - JSONL format
- **Queue persistence**: `state/queue.jsonl` - JSONL with cleanup (cron only)
- **Message tracking**: `conversation/*.jsonl` - `processedAt` field marks processed messages
- **Input logging**: `logs/agent-input/` - full context sent to Claude for debugging
- **Internal API proxy**: `api/proxy.ts` - forward requests to internal services through control plane

## Dev Commands

```bash
pnpm install
pnpm --filter @singularity/shared build      # Build shared types first
pnpm --filter @singularity/control-plane dev # Start API server
pnpm --filter @singularity/ui dev            # Start UI (separate terminal)
```

Docker:
```bash
docker-compose -f docker/docker-compose.yml build
docker-compose -f docker/docker-compose.yml up -d

# Manual cron run
docker exec -u agent singularity-agent /app/scripts/run-agent.sh --type cron

# Manual chat run (web channel)
docker exec -u agent singularity-agent /app/scripts/run-agent.sh --type chat --channel web
```

## Extensions

Extensions live in `packages/ui/src/extensions/[name]/` (UI) and `packages/control-plane/src/extensions/` (backend).

**Auto-discovery:** Vite's `import.meta.glob` scans `./*/manifest.json` and `./*/index.tsx` at build time. Each extension is code-split into a lazy-loaded chunk.

**Framework files (committed):**
- `extensions/types.ts` — `ExtensionManifest` and `ExtensionInfo` types
- `extensions/loader.ts` — `getExtensions()` via glob imports
- `extensions/ExtensionPage.tsx` — Error boundary + Suspense wrapper
- `extensions/_hello-world/` — Example extension

**Extension instances** (per-deployment, gitignored): any other subdirectory under `extensions/`.

**Backend:** `control-plane/src/extensions/_loader.ts` scans for `.js` files at startup, each exporting `registerRoutes(fastify, prefix)`. Routes mount at `/api/ext/[name]/*`.

**Core files modified once for the framework:**
- `router.tsx` — generates extension routes via `getExtensions()`, spreads into Layout children
- `Layout.tsx` — renders extension nav items after core items with a divider

See [EXTENSIONS.md](EXTENSIONS.md) for the full developer guide.

## Adding Features

**New API endpoint:**
1. Create handler in `packages/control-plane/src/api/`
2. Export `registerXxxRoutes(fastify)` function
3. Register in `index.ts`
4. Add types to `packages/shared/src/types.ts`
5. Add constants to `packages/shared/src/constants.ts`

**New UI view:**
1. Create component in `packages/ui/src/components/`
2. Add to `navItems` array in `Layout.tsx`
3. Add conditional render in Layout `<main>` block
4. Add view ID to store types

**New WebSocket event:**
1. Add event name to `WS_EVENTS` in `shared/constants.ts`
2. Add broadcast method to `WSManager` interface in `ws/events.ts`
3. Implement in manager object
4. Call from watcher or API handler

**New agent file:**
1. Add to `VIEWABLE_FILES` in `api/files.ts`
2. Optionally add to `WATCH_PATTERNS` in `shared/constants.ts`

**New channel:**
1. Add to `Channel` type in `shared/types.ts`
2. Create directory structure in `entrypoint.sh`
3. Add to watch patterns in `shared/constants.ts`
4. Handle in `conversation.ts` and `watcher/files.ts`

**New internal API proxy:**
1. Create proxy route in `packages/control-plane/src/api/{name}-proxy.ts`
2. Use `proxyRequest()` from `proxy.ts` with target URL and prefix config
3. Register in `index.ts`
4. Update UI components to use relative paths (e.g., `/api/{name}/*`)
5. Add env var for target URL (default to localhost port)

Example proxy config:
```typescript
// /api/myservice/* → http://localhost:4000/api/*
proxyRequest(request, {
  targetUrl: process.env.MYSERVICE_URL || 'http://localhost:4000',
  stripPrefix: '/api/myservice',
  addPrefix: '/api',
});
```

| Proxy Route | Target | Env Var |
|-------------|--------|---------|
| `/api/interview/*` | `http://localhost:3003/*` | `INTERVIEW_API_URL` |
| `/api/jobs-backend/*` | `http://localhost:3002/api/*` | `JOB_TRACKER_API_URL` |
