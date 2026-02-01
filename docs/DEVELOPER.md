# Singularity Developer Reference

## File Map

| Path | Purpose |
|------|---------|
| `packages/control-plane/src/index.ts` | Server entry, route registration, middleware |
| `packages/control-plane/src/api/chat.ts` | Chat endpoints, inbox append |
| `packages/control-plane/src/api/files.ts` | File CRUD, path security, vector search |
| `packages/control-plane/src/api/agent.ts` | Status, trigger run, run history |
| `packages/control-plane/src/api/outputs.ts` | Agent output listing |
| `packages/control-plane/src/ws/events.ts` | WebSocket manager, event broadcasting |
| `packages/control-plane/src/watcher/files.ts` | File change detection, conversation/run parsing |
| `packages/control-plane/src/conversation.ts` | Inbox/conversation file operations |
| `packages/control-plane/src/channels/telegram.ts` | Telegram bot integration |
| `packages/ui/src/components/Layout.tsx` | Main layout, nav items |
| `packages/ui/src/store.ts` | Zustand state |
| `packages/ui/src/lib/api.ts` | API client |
| `packages/shared/src/constants.ts` | Paths, WS events, API routes |
| `scripts/run-agent.sh` | Claude CLI invocation, context assembly |
| `scripts/heartbeat.sh` | Cron entry point |

## API Reference

| Endpoint | Handler | Notes |
|----------|---------|-------|
| `POST /api/chat` | `api/chat.ts:10` | Appends to INBOX.md |
| `GET /api/chat/history` | `api/chat.ts:31` | Query: `days` (default 7) |
| `GET /api/chat/history/:date` | `api/chat.ts:43` | Specific date |
| `GET /api/files` | `api/files.ts:28` | Lists VIEWABLE_FILES + memory/*.md |
| `GET /api/files/*` | `api/files.ts:80` | Read file (path traversal check :87) |
| `PUT /api/files/*` | `api/files.ts:110` | Update file (blocks TASKS.md :124) |
| `GET /api/files/search` | `api/files.ts:142` | Vector search via memory-search.py |
| `GET /api/status` | `api/agent.ts:16` | Lock file check, next run calc |
| `POST /api/agent/run` | `api/agent.ts:71` | Spawns heartbeat.sh detached |
| `GET /api/runs` | `api/agent.ts:103` | Query: `limit` (default 50) |
| `GET /api/outputs` | `api/outputs.ts:20` | Query: `limit` (default 20) |
| `GET /api/outputs/:id` | `api/outputs.ts:62` | ID sanitized :67 |
| `GET /health` | `index.ts:64` | Health check |

## WebSocket Events

| Event | Direction | Trigger |
|-------|-----------|---------|
| `file:changed` | S->C | File watcher detects change |
| `agent:started` | S->C | Lock file created |
| `agent:completed` | S->C | run-history.jsonl updated |
| `chat:received` | S->C | New line in conversation/*.jsonl |
| `chat:typing` | S->C | Not implemented |
| `chat:send` | C->S | Logged only; use REST |

## Data Flow

1. Human sends message via UI/Telegram
2. `POST /api/chat` appends to `agent/INBOX.md`
3. Cron runs `heartbeat.sh` hourly (or manual trigger via `/api/agent/run`)
4. `run-agent.sh` assembles context: SOUL.md + HEARTBEAT.md + TASKS.md + INBOX.md + MEMORY.md + recent logs
5. Claude CLI runs with `--dangerously-skip-permissions`
6. Agent writes responses to `agent/conversation/YYYY-MM-DD.jsonl`
7. File watcher detects change, broadcasts `chat:received`
8. UI receives via WebSocket

## Key Patterns

- **Path security**: `api/files.ts:86-90` - normalize + startsWith check
- **TASKS.md protected**: `api/files.ts:124` - write blocked
- **Agent state via lock**: `api/agent.ts:43` - `state/agent.lock` existence
- **ID sanitization**: `api/outputs.ts:67` - path.basename + regex
- **File cache dedup**: `watcher/files.ts:13` - skip unchanged content
- **Viewable files whitelist**: `api/files.ts:17-22`
- **Run history append-only**: `state/run-history.jsonl` - JSONL format

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
docker exec -u agent singularity-agent /app/scripts/heartbeat.sh  # Manual run
```

## Adding Features

**New API endpoint:**
1. Create handler in `packages/control-plane/src/api/`
2. Export `registerXxxRoutes(fastify)` function
3. Register in `index.ts:69-72`
4. Add types to `packages/shared/src/types.ts`
5. Add constants to `packages/shared/src/constants.ts`

**New UI view:**
1. Create component in `packages/ui/src/components/`
2. Add to `navItems` array in `Layout.tsx:9-14`
3. Add conditional render in Layout `<main>` block :55-60
4. Add view ID to store types

**New WebSocket event:**
1. Add event name to `WS_EVENTS` in `shared/constants.ts:30-40`
2. Add broadcast method to `WSManager` interface in `ws/events.ts:6-12`
3. Implement in manager object :48-97
4. Call from watcher or API handler

**New agent file:**
1. Add to `VIEWABLE_FILES` in `api/files.ts:17-22`
2. Optionally add to `WATCH_PATTERNS` in `shared/constants.ts:71-77`
