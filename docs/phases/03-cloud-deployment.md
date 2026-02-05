# Phase 3: Cloud Deployment (Google Cloud)

## Goal

Deploy Singularity to a Google Cloud Compute Engine instance so the agent runs 24/7.

---

## Prerequisites

- Google Cloud account with billing enabled
- `gcloud` CLI installed and authenticated
- Project created in GCP Console
- Local Docker setup working (Phase 1-2 complete)

---

## Tasks

### 3.1 GCP Project Setup

**Goal:** Configure GCP project and enable required APIs.

```bash
# Set project (replace with your project ID)
gcloud config set project YOUR_PROJECT_ID

# Enable required APIs
gcloud services enable compute.googleapis.com
gcloud services enable artifactregistry.googleapis.com

# Set default region
gcloud config set compute/region europe-west4
gcloud config set compute/zone europe-west4-a
```

### 3.2 Create Artifact Registry

**Goal:** Set up container registry for Docker images.

```bash
# Create repository
gcloud artifacts repositories create singularity \
  --repository-format=docker \
  --location=europe-west4 \
  --description="Singularity agent images"

# Configure Docker to use Artifact Registry
gcloud auth configure-docker europe-west4-docker.pkg.dev
```

Registry URL format: `europe-west4-docker.pkg.dev/PROJECT_ID/singularity/IMAGE_NAME`

### 3.3 Build and Push Images

**Goal:** Build images locally and push to Artifact Registry.

```bash
# Set variables
PROJECT_ID=$(gcloud config get-value project)
REGISTRY=europe-west4-docker.pkg.dev/$PROJECT_ID/singularity

# Build images
docker-compose -f docker/docker-compose.yml build

# Tag for Artifact Registry
docker tag singularity-agent $REGISTRY/agent:latest
docker tag singularity-vector $REGISTRY/vector:latest

# Push
docker push $REGISTRY/agent:latest
docker push $REGISTRY/vector:latest
```

### 3.4 Create GCE Instance

**Goal:** Provision a compute instance with Docker.

```bash
# Create instance with Container-Optimized OS
gcloud compute instances create singularity-agent \
  --machine-type=e2-small \
  --zone=europe-west4-a \
  --image-family=cos-stable \
  --image-project=cos-cloud \
  --boot-disk-size=20GB \
  --scopes=cloud-platform \
  --tags=singularity

# Or with Ubuntu (if you prefer apt-get)
gcloud compute instances create singularity-agent \
  --machine-type=e2-small \
  --zone=europe-west4-a \
  --image-family=ubuntu-2204-lts \
  --image-project=ubuntu-os-cloud \
  --boot-disk-size=20GB \
  --scopes=cloud-platform \
  --tags=singularity
```

### 3.5 Configure Instance

**Goal:** Set up Docker and deploy containers on the instance.

```bash
# SSH into instance
gcloud compute ssh singularity-agent --zone=europe-west4-a

# On the instance (Ubuntu):
sudo apt-get update
sudo apt-get install -y docker.io docker-compose
sudo usermod -aG docker $USER

# Authenticate with Artifact Registry
gcloud auth configure-docker europe-west4-docker.pkg.dev

# Create deployment directory
sudo mkdir -p /opt/singularity
cd /opt/singularity

# Copy docker-compose.yml and .env (see 3.6)
```

### 3.6 Deploy Containers

**Goal:** Run the agent containers on the instance.

Create `/opt/singularity/docker-compose.yml` on the instance:

```yaml
version: '3.8'

services:
  agent:
    image: europe-west4-docker.pkg.dev/PROJECT_ID/singularity/agent:latest
    container_name: singularity-agent
    restart: unless-stopped
    ports:
      - "3001:3001"
    volumes:
      - ./agent:/app/agent
      - ./logs:/app/logs
    env_file:
      - .env
    depends_on:
      - vector

  vector:
    image: europe-west4-docker.pkg.dev/PROJECT_ID/singularity/vector:latest
    container_name: singularity-vector
    restart: unless-stopped
```

Create `/opt/singularity/.env` with your environment variables:

```bash
AGENT_MODEL=sonnet
TZ=Europe/Helsinki
TELEGRAM_BOT_TOKEN=your-token
TELEGRAM_CHAT_ID=your-chat-id
OPENAI_API_KEY=your-key  # For Whisper
```

Start containers:

```bash
cd /opt/singularity
docker-compose pull
docker-compose up -d
```

### 3.7 Claude CLI Login

**Goal:** Authenticate Claude CLI on the cloud instance.

```bash
# SSH with port forwarding for OAuth callback
gcloud compute ssh singularity-agent --zone=europe-west4-a -- -L 8080:localhost:8080

# Inside the instance
docker exec -it -u agent singularity-agent claude login
```

### 3.8 Verify Deployment

**Goal:** Confirm everything is working.

```bash
# Check containers are running
docker ps

# Check health endpoint
curl localhost:3001/health

# Check logs
docker logs singularity-agent --tail 50

# Test Telegram (send a message to your bot)
```

---

## Backup Strategy

Use `/backup-cloud` skill to download timestamped backups to local machine.

Manual backup:

```bash
# From local machine
INSTANCE_IP=$(gcloud compute instances describe singularity-agent \
  --zone=europe-west4-a --format='get(networkInterfaces[0].accessConfigs[0].natIP)')

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
mkdir -p backups/cloud/$TIMESTAMP

rsync -avz --progress \
  $(whoami)@$INSTANCE_IP:/opt/singularity/agent/ \
  backups/cloud/$TIMESTAMP/
```

---

## Troubleshooting

### Can't pull images

```bash
# Re-authenticate Docker with Artifact Registry
gcloud auth configure-docker europe-west4-docker.pkg.dev

# Check service account permissions
gcloud compute instances describe singularity-agent \
  --format='get(serviceAccounts[0].email)'
```

### Container won't start

```bash
# Check logs
docker logs singularity-agent

# Check disk space
df -h

# Restart containers
docker-compose down && docker-compose up -d
```

### Claude CLI auth expired

```bash
# Re-login
docker exec -it -u agent singularity-agent claude login
```

---

## Next Steps

- [Phase 4: CI/CD](04-ci-cd.md) - Automate deployments
- [Phase 5: Secure Access](05-access-authentication.md) - Set up IAP for web UI access
