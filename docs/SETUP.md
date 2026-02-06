# Production Setup (GCP)

## First Deployment

On GCP host, before first `docker-compose up`:

1. Clone repo to `/opt/singularity`
2. Copy `agent/` directory from local (or create from template)
   - Note: `agent/context/` is gitignored, must be created manually
3. Create `.env` file with required variables (secrets stay server-side only)
4. Set volume permissions:
   ```bash
   chown -R 1000:1000 /mnt/pd/data/singularity/agent  # agent user UID
   chown -R 0:0 /mnt/pd/data/singularity/vector       # vector runs as root
   ```
5. Run `docker-compose -f docker/docker-compose.prod.yml up -d`
6. Login to Claude: `docker exec -it -u agent singularity-agent claude login`

## Subsequent Deployments

Handled automatically by GitHub Actions on push to main.

## CI/CD Setup

1. Add `GCP_SA_KEY` secret to GitHub repo (JSON service account key)
2. Workflow builds both images and pushes to ghcr.io
3. Deploy SSHs to GCP via IAP and runs `deploy-service singularity`

## Server Commands (via SSH)

```bash
sudo /usr/local/bin/deploy-service singularity      # Deploy both containers
sudo /usr/local/bin/service-status singularity      # Check agent status
sudo /usr/local/bin/service-status singularity-vector
sudo /usr/local/bin/service-logs singularity 100    # View last 100 log lines
sudo /usr/local/bin/service-shell singularity       # Shell into container
```

## Directory Structure on Host

```
/opt/singularity/
├── agent/              # Volume-mounted into container
│   ├── context/        # SOUL.md, SYSTEM.md, etc.
│   ├── operations/     # MEMORY.md, TASKS_*.md, etc.
│   ├── memory/         # Detailed knowledge files
│   └── conversation/   # Chat history
├── logs/               # Agent logs (volume-mounted)
├── state/              # Persistent state (volume-mounted)
└── .env                # Environment variables
```

## Required Environment Variables

See `.env.example` for the full list. Critical ones:

- `TELEGRAM_BOT_TOKEN` - For Telegram integration
- `TELEGRAM_CHAT_ID` - Your Telegram chat ID
- `OPENAI_API_KEY` - For Whisper transcription
- `CONTROL_PLANE_TOKEN` - Optional API auth token
