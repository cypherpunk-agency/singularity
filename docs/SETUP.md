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
tar -czvf agent-files.tar.gz agent/context agent/operations agent/memory agent/conversation agent/daily-briefings agent/daily-logs
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

| Variable | Required | Description |
|----------|----------|-------------|
| `VECTOR_SERVICE_URL` | Yes | Vector service URL (e.g., `http://vector:5000` or `http://singularity-vector:5000`) |
| `TELEGRAM_BOT_TOKEN` | No | Telegram bot token from @BotFather (see next section) |
| `TELEGRAM_CHAT_ID` | No | Your Telegram chat ID |
| `OPENAI_API_KEY` | No | OpenAI API key for Whisper voice transcription |
| `CONTROL_PLANE_TOKEN` | No | API authentication token for the control plane |
| `EXTRA_SCAN_DIRS` | No | Colon-separated container paths to index (add matching volume mounts) |

**Notes:**
- Keep secrets in `.env` only, never in Docker images or git
- If Telegram variables are missing, the bot is skipped gracefully — chat still works via the web UI
- `VECTOR_SERVICE_URL` hostname depends on your Docker network setup

## 4. Set Up Telegram Bot (Optional)

Skip this section if you don't need Telegram — the web UI works without it.

1. **Create a bot** — message [@BotFather](https://t.me/BotFather) on Telegram and send `/newbot`. Follow the prompts to name your bot.

2. **Copy the bot token** — BotFather gives you a token like `123456:ABC-DEF...`. Add it to `.env`:
   ```
   TELEGRAM_BOT_TOKEN=123456:ABC-DEF...
   ```

3. **Get your chat ID** — start a conversation with your new bot (send `/start`). Then visit:
   ```
   https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates
   ```
   Look for `"chat":{"id":123456789}` in the response. Add it to `.env`:
   ```
   TELEGRAM_CHAT_ID=123456789
   ```

**One bot token per deployment** — Telegram uses long-polling, so only one running instance can connect per token. If you run multiple deployments (e.g. cloud + local dev), create a separate bot for each, or leave `TELEGRAM_BOT_TOKEN` empty on instances that don't need Telegram.

## 5. Set File Permissions

The agent container runs as UID 1000:

```bash
sudo chown -R 1000:1000 agent/
```

## 6. Deploy

**Using docker-compose.prod.yml (pulls pre-built images):**
```bash
docker-compose -f docker/docker-compose.prod.yml --env-file .env up -d
```

**Or build locally:**
```bash
docker-compose -f docker/docker-compose.yml --env-file .env up -d --build
```

## 7. Configure Reverse Proxy

Example Caddy configuration:

```
singularity.yourdomain.com {
    reverse_proxy localhost:3001
}
```

### Security: Basic Auth

The web portal should be protected with authentication. Basic auth is simple and effective over HTTPS.

**Generate password hash:**
```bash
caddy hash-password --plaintext 'YOUR_STRONG_PASSWORD'
```

**Add to Caddyfile:**
```
singularity.yourdomain.com {
    basicauth {
        username $2a$14$... # bcrypt hash from above
    }
    reverse_proxy localhost:3001
}
```

**Reload Caddy:**
```bash
sudo systemctl reload caddy
```

**Notes:**
- Use a strong password (24+ chars, random)
- Password is encrypted in transit via HTTPS
- Browser remembers credentials after first login
- Telegram is unaffected (operates server-side)

## 8. Set Up Claude Code (First Time)

Singularity uses [Claude Code](https://docs.anthropic.com/en/docs/claude-code) in headless mode. This requires a **Claude Max subscription** — no API key needed.

```bash
docker exec -it -u agent singularity-agent claude login
```

The command outputs a URL — open it in your browser to authenticate via OAuth.

**Headless/SSH servers:** Copy the URL to your local browser, complete the OAuth flow, and the CLI picks up the token automatically.

The session is stored in the `singularity-claude-data` Docker volume and persists across container restarts and rebuilds. You only need to re-login if you delete the volume or rebuild the Docker image from scratch.

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
