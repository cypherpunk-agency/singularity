# Production Setup (GCP)

## First Deployment

### 1. Prepare Agent Directory

The `agent/` directory is gitignored and must be copied manually. On your local machine:

```bash
# From repo root, create a tarball of agent files
tar -czvf agent-files.tar.gz agent/context agent/operations agent/memory
```

Required structure:
```
agent/
├── context/           # Core identity (REQUIRED)
│   ├── SOUL.md
│   ├── SYSTEM.md
│   ├── HEARTBEAT.md
│   ├── CONVERSATION.md
│   ├── TELEGRAM.md    # Optional
│   └── WEB.md         # Optional
├── operations/        # Task coordination (REQUIRED)
│   ├── MEMORY.md
│   ├── OPERATIONS.md
│   ├── PROJECTS.md
│   ├── TASKS_SINGULARITY.md
│   ├── TASKS_TOMMI.md
│   ├── initiatives/
│   ├── scheduled/
│   └── sop/
├── memory/            # Knowledge files
└── conversation/      # Chat history (created automatically)
```

### 2. Upload to Server

```bash
# Copy tarball to server
gcloud compute scp agent-files.tar.gz web-server:/tmp/ \
  --zone=us-central1-a --tunnel-through-iap

# SSH in and extract
gcloud compute ssh web-server --zone=us-central1-a --tunnel-through-iap

# On server:
cd /mnt/pd/data/singularity
sudo tar -xzvf /tmp/agent-files.tar.gz
sudo chown -R 1000:1000 agent/  # agent user UID
rm /tmp/agent-files.tar.gz
```

### 3. Configure Secrets

Create/update `.env` on the server (secrets stay server-side, never in git):

```bash
sudo nano /mnt/pd/data/singularity/.env
```

Required variables:
```
TELEGRAM_BOT_TOKEN=your-real-token
TELEGRAM_CHAT_ID=your-chat-id
OPENAI_API_KEY=sk-your-key
CONTROL_PLANE_TOKEN=optional-api-auth-token
```

### 4. Deploy

```bash
sudo /usr/local/bin/deploy-service singularity
```

### 5. Login to Claude (first time only)

```bash
sudo docker exec -it -u agent singularity claude login
```

## Subsequent Deployments

Handled automatically by GitHub Actions on push to main.

## CI/CD Setup

1. Add `GCP_SA_KEY` secret to GitHub repo (JSON service account key)
2. Workflow builds both images and pushes to ghcr.io
3. Deploy SSHs to GCP via IAP and runs `deploy-service singularity`

## Server Commands

```bash
# Via gcloud SSH
gcloud compute ssh web-server --zone=us-central1-a --tunnel-through-iap \
  --command="sudo /usr/local/bin/service-status singularity"

# Once on server
sudo /usr/local/bin/deploy-service singularity      # Deploy both containers
sudo /usr/local/bin/service-status singularity      # Check agent status
sudo /usr/local/bin/service-logs singularity 100    # View last 100 log lines
sudo /usr/local/bin/service-shell singularity       # Shell into container
```

## Directory Structure on Host

```
/mnt/pd/data/singularity/
├── agent/              # Volume-mounted into container at /app/agent
│   ├── context/        # SOUL.md, SYSTEM.md, etc.
│   ├── operations/     # MEMORY.md, TASKS_*.md, etc.
│   ├── memory/         # Detailed knowledge files
│   └── conversation/   # Chat history
├── vector/             # Vector service state
└── .env                # Environment variables (server-side only)
```

## Container UIDs

| Container | User | UID:GID | Writes to |
|-----------|------|---------|-----------|
| singularity | agent | 1000:1000 | /app/agent |
| singularity-vector | root | 0:0 | /app/state |

## Troubleshooting

| Symptom | Check | Likely Cause |
|---------|-------|--------------|
| 502 Bad Gateway | `service-status` | Container crashed or not running |
| Container restarting | `service-logs` | Missing env vars or agent files |
| Telegram errors | Check TELEGRAM_BOT_TOKEN | Invalid or placeholder token |
| "file not found" errors | Check agent/ structure | Missing context/ or operations/ |
