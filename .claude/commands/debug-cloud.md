# Cloud Container Management

## Services

| Service | Container | Description |
|---------|-----------|-------------|
| `singularity` | Agent | Control plane + Claude CLI |
| `singularity-vector` | Vector | Memory search service |

## Quick Debug Flow

```
1. service-status → healthy/unhealthy?
       ↓ unhealthy
2. service-logs → container output (WHAT failed)
       ↓ shows error or crash
3. Shell in → inspect directly (WHY it failed)
```

## Commands

### 1. Check Status
```bash
# Agent
gcloud compute ssh web-server --zone=us-central1-a --tunnel-through-iap \
  --command="sudo /usr/local/bin/service-status singularity"

# Vector
gcloud compute ssh web-server --zone=us-central1-a --tunnel-through-iap \
  --command="sudo /usr/local/bin/service-status singularity-vector"
```

### 2. View Logs
```bash
# Agent (last 100 lines)
gcloud compute ssh web-server --zone=us-central1-a --tunnel-through-iap \
  --command="sudo /usr/local/bin/service-logs singularity 100"

# Vector
gcloud compute ssh web-server --zone=us-central1-a --tunnel-through-iap \
  --command="sudo /usr/local/bin/service-logs singularity-vector 100"
```

### 3. Shell Access
```bash
# Agent
gcloud compute ssh web-server --zone=us-central1-a --tunnel-through-iap \
  --command="sudo /usr/local/bin/service-shell singularity"

# Vector
gcloud compute ssh web-server --zone=us-central1-a --tunnel-through-iap \
  --command="sudo /usr/local/bin/service-shell singularity-vector"
```

### 4. Deploy
```bash
gcloud compute ssh web-server --zone=us-central1-a --tunnel-through-iap \
  --command="sudo /usr/local/bin/deploy-service singularity"
```

### 5. Direct Testing
```bash
# Check health endpoint from inside
gcloud compute ssh web-server --zone=us-central1-a --tunnel-through-iap \
  --command="sudo docker exec singularity curl -s localhost:3001/health"

# Check vector health
gcloud compute ssh web-server --zone=us-central1-a --tunnel-through-iap \
  --command="sudo docker exec singularity-vector curl -s localhost:5000/health"

# Check env vars
gcloud compute ssh web-server --zone=us-central1-a --tunnel-through-iap \
  --command="sudo docker exec singularity env | grep -E 'TELEGRAM|OPENAI|CONTROL'"
```

## Common Issues

| Symptom | Check | Likely Cause |
|---------|-------|--------------|
| 502 Bad Gateway | service-status | Container not running or wrong port |
| Container restarting | service-logs | Crash on startup, check logs |
| Telegram not working | env vars | Missing TELEGRAM_BOT_TOKEN |
| Vector search failing | vector status | Vector container unhealthy |
