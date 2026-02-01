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
| `packages/ui/src/components/Layout.tsx` | Main layout, nav items |
| `packages/ui/src/store.ts` | Zustand state |
| `packages/ui/src/lib/api.ts` | API client |
| `packages/shared/src/constants.ts` | Paths, WS events, API routes |
| `packages/shared/src/types.ts` | Shared types (Channel, RunType, Message, etc.) |
| `scripts/run-agent.sh` | Claude CLI invocation, context assembly |
| `config/SOUL.md` | Core identity (all contexts) |
| `config/CONVERSATION.md` | Chat-specific system prompt |
| `config/HEARTBEAT.md` | Cron-specific system prompt |

## Session Architecture

The agent uses **per-channel sessions** with **cross-session memory**:

```
┌─────────────────────────────────────────────────────────────────┐
│                     Shared Cross-Session Context                 │
│         config/SOUL.md, agent/MEMORY.md, agent/TASKS.md         │
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
| Web chat | SOUL.md + CONVERSATION.md | conversation/web/ | MEMORY.md, TASKS.md |
| Telegram | SOUL.md + CONVERSATION.md | conversation/telegram/ | MEMORY.md, TASKS.md |
| Cron | SOUL.md + HEARTBEAT.md | None | MEMORY.md, TASKS.md |

## API Reference

| Endpoint | Handler | Notes |
|----------|---------|-------|
| `POST /api/chat` | `api/chat.ts` | Saves to channel conversation, triggers agent |
| `POST /api/chat/respond` | `api/chat.ts` | Agent sends response, broadcasts + sends to telegram |
| `GET /api/chat/history` | `api/chat.ts` | Query: `channel`, `limit` |
| `GET /api/chat/history/:date` | `api/chat.ts` | Query: `channel` |
| `GET /api/files` | `api/files.ts` | Lists VIEWABLE_FILES + memory/*.md |
| `GET /api/files/*` | `api/files.ts` | Read file (path traversal check) |
| `PUT /api/files/*` | `api/files.ts` | Update file (blocks TASKS.md) |
| `GET /api/files/search` | `api/files.ts` | Vector search via memory-search.py |
| `GET /api/status` | `api/agent.ts` | Lock file check, next run calc |
| `POST /api/agent/run` | `api/agent.ts` | Body: `{type, channel, prompt}` |
| `GET /api/runs` | `api/agent.ts` | Query: `limit` (default 50) |
| `GET /api/outputs` | `api/outputs.ts` | Query: `limit` (default 20) |
| `GET /api/outputs/:id` | `api/outputs.ts` | ID sanitized |
| `GET /api/debug/conversations` | `api/debug.ts` | View all recent conversations |
| `GET /api/debug/conversations/:channel` | `api/debug.ts` | View channel conversations |
| `GET /api/debug/runs` | `api/debug.ts` | View recent agent runs |
| `GET /api/debug/runs/:id` | `api/debug.ts` | View run with full input/output |
| `GET /api/debug/runs/:id/input` | `api/debug.ts` | Get just the input |
| `GET /api/debug/runs/:id/output` | `api/debug.ts` | Get just the output |
| `GET /health` | `index.ts` | Health check |

## WebSocket Events

| Event | Direction | Trigger |
|-------|-----------|---------|
| `file:changed` | S->C | File watcher detects change |
| `agent:started` | S->C | Lock file created |
| `agent:completed` | S->C | run-history.jsonl updated |
| `chat:received` | S->C | New line in conversation/web/*.jsonl or conversation/telegram/*.jsonl |
| `chat:typing` | S->C | Not implemented |
| `chat:send` | C->S | Logged only; use REST |

## Data Flow

### Chat Message Flow

1. Human sends message via UI/Telegram
2. `POST /api/chat` saves to `agent/conversation/{channel}/YYYY-MM-DD.jsonl`
3. Agent triggered with `--type chat --channel {channel}`
4. `run-agent.sh` assembles context: SOUL.md + CONVERSATION.md + channel history + MEMORY.md + TASKS.md
5. Claude CLI runs with `--dangerously-skip-permissions`
6. Agent calls `curl -X POST /api/chat/respond` to send response
7. Response saved to channel conversation, broadcast via WebSocket
8. If telegram channel, also sent to Telegram

### Cron (Heartbeat) Flow

1. Cron triggers `run-agent.sh --type cron`
2. `run-agent.sh` assembles context: SOUL.md + HEARTBEAT.md + MEMORY.md + TASKS.md
3. Claude CLI runs with `--dangerously-skip-permissions`
4. Agent manages tasks, updates MEMORY.md, etc.

## Key Patterns

- **Per-channel conversations**: `conversation.ts` - separate directories for web/telegram
- **Path security**: `api/files.ts` - normalize + startsWith check
- **TASKS.md protected**: `api/files.ts` - write blocked
- **Agent state via lock**: `api/agent.ts` - `state/agent.lock` existence
- **ID sanitization**: `api/outputs.ts` - path.basename + regex
- **File cache dedup**: `watcher/files.ts` - skip unchanged content
- **Viewable files whitelist**: `api/files.ts`
- **Run history append-only**: `state/run-history.jsonl` - JSONL format
- **Input logging**: `logs/agent-input/` - full context sent to Claude for debugging

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
