# Backup Cloud Agent

Download a timestamped backup of the cloud agent's `agent/` folder to local `backups/cloud/`.

## Prerequisites

- Cloud instance running with SSH access via gcloud
- `gcloud` CLI authenticated
- Instance zone: europe-west4-a (or check with `gcloud compute instances list`)

## Steps

1. Create the backup directory if it doesn't exist: `backups/cloud/`
2. Generate a timestamp in YYYYMMDD-HHMMSS format
3. Get the instance external IP using gcloud
4. Use rsync to download from cloud to `backups/cloud/<timestamp>/`:
   ```bash
   rsync -avz --progress USER@INSTANCE_IP:/opt/singularity/agent/ backups/cloud/<timestamp>/
   ```
5. List the backed up files to confirm success
6. Report the backup location and size

## What's Backed Up

- `agent/memory/` - Long-term knowledge
- `agent/operations/` - Tasks, projects, memory
- `agent/conversation/` - Chat history
- `agent/context/` - Identity files

## What's NOT Backed Up (regeneratable)

- `logs/` - Can rebuild
- `state/` - Vector index, can rebuild
- Claude credentials - Re-login if lost

## Example Commands

```bash
# Get instance IP
INSTANCE_IP=$(gcloud compute instances describe singularity-agent \
  --zone=europe-west4-a \
  --format='get(networkInterfaces[0].accessConfigs[0].natIP)')

# Create timestamped backup
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
mkdir -p backups/cloud/$TIMESTAMP

# Download via rsync
rsync -avz --progress $(whoami)@$INSTANCE_IP:/opt/singularity/agent/ backups/cloud/$TIMESTAMP/

# Report size
du -sh backups/cloud/$TIMESTAMP/
```

## Alternative: Via IAP (no public IP)

If instance has no external IP, use IAP tunnel:

```bash
# Start IAP tunnel in background
gcloud compute start-iap-tunnel singularity-agent 22 \
  --zone=europe-west4-a \
  --local-host-port=localhost:2222 &

# Wait for tunnel to establish
sleep 3

# Rsync through tunnel
rsync -avz -e "ssh -p 2222" --progress \
  localhost:/opt/singularity/agent/ \
  backups/cloud/$TIMESTAMP/
```
