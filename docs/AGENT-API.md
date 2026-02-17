# Agent-to-Agent API

Connect your AI agent to Singularity. Agent channels use the `agent-{name}` naming pattern (e.g., `agent-alice`).

## Authentication

If `CONTROL_PLANE_TOKEN` is set, include it in all requests:

```
Authorization: Bearer <token>
```

## Sending a Message

```
POST /api/chat
Content-Type: application/json
```

**Request:**

```json
{
  "text": "What's the status of project X?",
  "channel": "agent-alice",
  "callback_url": "https://your-agent.example.com/callback",
  "callback_secret": "optional-shared-secret"
}
```

- `channel` (required): Must match `agent-{name}` pattern
- `callback_url` (required): URL where Singularity will POST the response
- `callback_secret` (optional): Sent as `Authorization: Bearer <secret>` on callback

**Response:**

```json
{
  "request_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "queued"
}
```

The `request_id` is the idempotency key. Store it to correlate with the callback.

## Receiving Responses

Singularity POSTs to your `callback_url` when processing completes:

```
POST <callback_url>
Content-Type: application/json
Authorization: Bearer <callback_secret>
```

**Success payload:**

```json
{
  "request_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "completed",
  "text": "Project X is on track. Last commit was 2h ago...",
  "meta": {
    "channel": "agent-alice",
    "duration_ms": 45000
  }
}
```

**Failure payload:**

```json
{
  "request_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "failed",
  "error": "Processing failed after maximum retries",
  "meta": {
    "channel": "agent-alice"
  }
}
```

**Callback behavior:**
- 3 retries, 10 seconds apart
- 10 second timeout per attempt
- Success = any 2xx status code

## Polling Fallback

If your agent can't receive webhooks, poll for the result:

```
GET /api/chat/result?request_id=550e8400-e29b-41d4-a716-446655440000
```

Returns the callback payload (same schema as above) or `404` if not yet available.

Results are stored for 1 hour after completion.

## Conversation History

Retrieve past messages for your channel:

```
GET /api/chat/history?channel=agent-alice&limit=50
```

## Ordering Guarantees

- Messages are processed one at a time per channel
- Responses are returned in submission order
- Multiple rapid messages are batched into a single agent run

## Channel Naming

Use `agent-{name}` where `{name}` identifies your agent. Examples:
- `agent-alice`
- `agent-research-bot`
- `agent-scheduler`

Each agent gets its own conversation history directory and processing lock.

## Quick Start

```bash
# Send a message
curl -X POST http://localhost:3001/api/chat \
  -H 'Content-Type: application/json' \
  -d '{
    "text": "Hello from Alice",
    "channel": "agent-alice",
    "callback_url": "http://your-host:9999/callback"
  }'

# Poll for result (alternative to callback)
curl "http://localhost:3001/api/chat/result?request_id=<id-from-response>"

# View conversation history
curl "http://localhost:3001/api/chat/history?channel=agent-alice"
```
