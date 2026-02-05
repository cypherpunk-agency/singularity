# Production Setup (GCP)

## First Deployment

On GCP host, before first `docker-compose up`:

1. Clone repo to `/opt/singularity`
2. Copy `agent/` directory from local (or create from template)
3. Create `.env` file with required variables
4. Run `docker-compose -f docker/docker-compose.prod.yml up -d`
5. Login to Claude: `docker exec -it -u agent singularity-agent claude login`

## Subsequent Deployments

Handled automatically by GitHub Actions on push to main.

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
