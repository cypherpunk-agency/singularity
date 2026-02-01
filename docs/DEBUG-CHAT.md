# Debugging Chat & Agent Trigger Issues

Quick reference for debugging the chat system and agent triggering.

## Check Agent Status

```bash
# Is agent running?
curl -s http://localhost:3001/api/status | jq

# Check lock file (is agent actually running?)
docker exec singularity-agent bash -c "flock -n /app/state/agent.lock -c 'echo Lock is free' || echo 'Lock is held'"
```

## View Logs

```bash
# Control plane logs (API requests, errors)
docker logs singularity-agent --tail 50

# Filter for errors
docker logs singularity-agent 2>&1 | grep -i "error" | tail -20

# Filter for chat requests
docker logs singularity-agent 2>&1 | grep -i "chat\|POST" | tail -20
```

## Check Run History

```bash
# Recent agent runs (exit codes, duration, cost)
docker exec singularity-agent bash -c "tail -5 /app/state/run-history.jsonl | jq"

# View run history via API
curl -s http://localhost:3001/api/debug/runs | jq

# Check specific run with full input/output
curl -s http://localhost:3001/api/debug/runs/20260201-123456 | jq

# View just the input for a run
curl -s http://localhost:3001/api/debug/runs/20260201-123456/input

# View just the output for a run
curl -s http://localhost:3001/api/debug/runs/20260201-123456/output
```

## Check File Ownership

```bash
# If files owned by root instead of agent, control plane is running as wrong user
docker exec singularity-agent bash -c "ls -la /app/logs/agent-output/ | tail -5"
docker exec singularity-agent bash -c "ls -la /app/state/"
```

## Test Agent Manually

```bash
# Run agent directly - cron mode (heartbeat)
docker exec -u agent singularity-agent bash -c "/app/scripts/run-agent.sh --type cron"

# Run agent directly - chat mode for web
docker exec -u agent singularity-agent bash -c "/app/scripts/run-agent.sh --type chat --channel web"

# Run agent directly - chat mode for telegram
docker exec -u agent singularity-agent bash -c "/app/scripts/run-agent.sh --type chat --channel telegram"

# Test via API - trigger cron run
curl -s -X POST http://localhost:3001/api/agent/run \
  -H "Content-Type: application/json" \
  -d '{"type":"cron"}'

# Test via API - trigger chat run for web
curl -s -X POST http://localhost:3001/api/agent/run \
  -H "Content-Type: application/json" \
  -d '{"type":"chat","channel":"web"}'

# Send chat message (web channel)
curl -s -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{"text":"Test message","channel":"web"}'

# Send chat message (telegram channel)
curl -s -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{"text":"Test message","channel":"telegram"}'
```

## Check Conversation Log

```bash
# View recent web messages
docker exec singularity-agent bash -c "tail -10 /app/agent/conversation/web/$(date +%Y-%m-%d).jsonl"

# View recent telegram messages
docker exec singularity-agent bash -c "tail -10 /app/agent/conversation/telegram/$(date +%Y-%m-%d).jsonl"

# View conversations via API
curl -s http://localhost:3001/api/debug/conversations | jq

# View web conversations via API
curl -s http://localhost:3001/api/debug/conversations/web | jq

# View telegram conversations via API
curl -s http://localhost:3001/api/debug/conversations/telegram | jq
```

## Verify Compiled Code

```bash
# Check if source changes are compiled
docker exec singularity-agent bash -c "grep -n 'triggerAgentRun' /app/packages/control-plane/dist/api/chat.js"

# Check utils
docker exec singularity-agent bash -c "cat /app/packages/control-plane/dist/utils/agent.js"
```

## Rebuild & Restart

```bash
# Rebuild TypeScript inside container (source is mounted)
docker exec singularity-agent pnpm --filter @singularity/control-plane build

# Restart to pick up changes
docker restart singularity-agent

# If entrypoint.sh changed, rebuild image
docker-compose -f docker/docker-compose.yml build agent
docker-compose -f docker/docker-compose.yml up -d agent
```

## Common Issues

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| Message doesn't appear in UI | WebSocket stale closure | Check `useWebSocket.ts` uses ref pattern |
| Agent not triggered | Control plane not calling `triggerAgentRun` | Check `chat.ts` imports and calls it |
| Exit code 4, 0 cost | Agent script failing early | Check file ownership, user permissions |
| Files owned by root | Control plane running as root | Check `entrypoint.sh` runs node as agent user |
| "No result received" | Claude CLI not producing output | Check HOME env var set to `/home/agent` |
| Agent works manually but not triggered | Environment difference | Compare env vars, check spawn options |
| Conversation not saved | Wrong channel directory | Check per-channel directories exist |

## Key Files

- `/app/packages/control-plane/dist/` - Compiled control plane
- `/app/state/agent.lock` - Lock file for preventing concurrent runs
- `/app/state/run-history.jsonl` - Agent run history
- `/app/logs/agent-output/` - Individual run outputs (JSON and markdown)
- `/app/logs/agent-input/` - Full context sent to Claude (for debugging)
- `/app/agent/conversation/web/` - Web chat messages
- `/app/agent/conversation/telegram/` - Telegram chat messages
- `/app/config/CONVERSATION.md` - Chat mode system prompt
- `/app/config/HEARTBEAT.md` - Cron mode system prompt
- `/app/config/SOUL.md` - Core identity (used in all modes)
