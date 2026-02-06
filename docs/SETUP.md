# Production Setup

Guide for deploying Singularity to a production server.

## Prerequisites

- Docker and Docker Compose installed on your server
- Domain name pointing to your server (for HTTPS)
- Reverse proxy (Caddy, nginx, Traefik) for SSL termination

## 1. Clone the Repository

```bash
git clone https://github.com/cypherpunk-agency/singularity.git
cd singularity
```

## 2. Prepare Agent Directory

The `agent/` directory contains the agent's identity and memory. It's gitignored because it contains personal data.

**Option A: Copy from local development**
```bash
tar -czvf agent-files.tar.gz agent/context agent/operations agent/memory
# Transfer to server and extract
```

**Option B: Create from scratch**
```bash
mkdir -p agent/{context,operations,memory,conversation}
```

Then create the required files:

```
agent/
├── context/           # Core identity (REQUIRED)
│   ├── SOUL.md        # Agent personality and values
│   ├── SYSTEM.md      # System overview and APIs
│   ├── HEARTBEAT.md   # Cron mode instructions
│   ├── CONVERSATION.md # Chat mode instructions
│   ├── TELEGRAM.md    # Telegram-specific (optional)
│   └── WEB.md         # Web-specific (optional)
├── operations/        # Task coordination (REQUIRED)
│   ├── MEMORY.md      # Persistent facts
│   ├── OPERATIONS.md  # How agent and human coordinate
│   ├── PROJECTS.md    # Project directory
│   ├── TASKS_SINGULARITY.md  # Agent task queue
│   └── TASKS_TOMMI.md # Human task queue
├── memory/            # Detailed knowledge files
└── conversation/      # Chat history (created automatically)
```

See `agent/context/` in the repo for example templates.

## 3. Configure Environment

Create `.env` file:

```bash
cp .env.example .env
nano .env
```

Required variables:

| Variable | Description |
|----------|-------------|
| `VECTOR_SERVICE_URL` | Vector service URL (e.g., `http://vector:5000` or `http://singularity-vector:5000`) |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token from @BotFather |
| `TELEGRAM_CHAT_ID` | Your Telegram chat ID |
| `OPENAI_API_KEY` | OpenAI API key for Whisper transcription |
| `CONTROL_PLANE_TOKEN` | Optional API authentication token |

**Notes:**
- Keep secrets in `.env` only, never in Docker images or git
- If Telegram token is missing or invalid, the bot is skipped gracefully
- `VECTOR_SERVICE_URL` hostname depends on your Docker network setup

## 4. Set File Permissions

The agent container runs as UID 1000:

```bash
sudo chown -R 1000:1000 agent/
```

## 5. Deploy

**Using docker-compose.prod.yml (pulls pre-built images):**
```bash
docker-compose -f docker/docker-compose.prod.yml --env-file .env up -d
```

**Or build locally:**
```bash
docker-compose -f docker/docker-compose.yml --env-file .env up -d --build
```

## 6. Configure Reverse Proxy

Example Caddy configuration:

```
singularity.yourdomain.com {
    reverse_proxy localhost:3001
}
```

## 7. Login to Claude (First Time)

```bash
docker exec -it -u agent singularity-agent claude login
```

Follow the prompts to authenticate.

## CI/CD Setup (Optional)

To auto-deploy on push to main:

1. Add `GCP_SA_KEY` (or equivalent) as a GitHub secret
2. Configure `.github/workflows/deploy.yml` for your infrastructure
3. The workflow builds images, pushes to registry, and SSHs to deploy

## Server Management

```bash
# Check status
docker-compose -f docker/docker-compose.prod.yml ps

# View logs
docker logs singularity-agent --tail 100
docker logs singularity-vector --tail 100

# Restart
docker-compose -f docker/docker-compose.prod.yml restart

# Shell access
docker exec -it -u agent singularity-agent bash
```

## Directory Structure

```
/your/deploy/path/
├── agent/              # Volume-mounted at /app/agent
│   ├── context/
│   ├── operations/
│   ├── memory/
│   └── conversation/
├── logs/               # Agent logs
├── state/              # Persistent state (vector DB, sessions)
└── .env                # Environment variables
```

## Container Details

| Container | User | UID:GID | Ports | Writes to |
|-----------|------|---------|-------|-----------|
| singularity-agent | agent | 1000:1000 | 3001 | /app/agent, /app/logs |
| singularity-vector | root | 0:0 | 5000 | /app/state |

## Troubleshooting

| Symptom | Check | Likely Cause |
|---------|-------|--------------|
| 502 Bad Gateway | Container status | Container crashed or wrong port |
| Container restarting | Container logs | Missing env vars or agent files |
| Telegram not working | TELEGRAM_BOT_TOKEN | Invalid token (check with @BotFather) |
| Vector "unavailable" | VECTOR_SERVICE_URL | Wrong hostname or vector container down |
| Permission denied | File ownership | Run `chown -R 1000:1000 agent/` |
| Claude not responding | Claude login | Run `docker exec -it -u agent singularity-agent claude login` |

## Health Check

```bash
curl http://localhost:3001/health
# Returns: {"status":"ok","services":{"vector":{"status":"ok"}}}
```
