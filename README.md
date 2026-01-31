# Singularity

A containerized autonomous agent using Claude Code CLI headless mode.

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
   docker exec -it singularity-agent claude login
   ```

5. **Add tasks to `agent/HEARTBEAT.md`** and the agent will process them on the next hourly run.

## Manual Testing

Run a heartbeat manually:
```bash
docker exec singularity-agent /app/scripts/heartbeat.sh
```

Check logs:
```bash
docker logs singularity-agent
# or
cat logs/heartbeat.log
```

## Architecture

### File Structure

- `agent/HEARTBEAT.md` - Task checklist (agent reads this each run)
- `agent/MEMORY.md` - Long-term curated memory
- `agent/memory/YYYY-MM-DD.md` - Daily append-only logs

### Scripts

- `scripts/heartbeat.sh` - Cron entry point
- `scripts/run-agent.sh` - Claude CLI wrapper
- `scripts/memory-manager.sh` - Memory utilities
- `scripts/memory-search.py` - Vector search implementation

### Memory System

Two-layer memory architecture:

1. **MEMORY.md**: Persistent facts, preferences, and decisions
2. **Daily logs**: Session activities and temporary notes

Vector search enables semantic retrieval across all memory files using local embeddings (no API keys required).

## Commands

### Memory Manager

```bash
# Initialize memory structure
docker exec singularity-agent /app/scripts/memory-manager.sh init

# Consolidate old logs (auto-runs at 3 AM)
docker exec singularity-agent /app/scripts/memory-manager.sh consolidate

# Rebuild vector index
docker exec singularity-agent /app/scripts/memory-manager.sh index

# Search memory
docker exec singularity-agent /app/scripts/memory-manager.sh search "query"

# List memory files
docker exec singularity-agent /app/scripts/memory-manager.sh list
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
| `EMBEDDING_MODEL` | `all-MiniLM-L6-v2` | Local embedding model |

## License

MIT
