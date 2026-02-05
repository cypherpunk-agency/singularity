# Phase 5: Secure Access & Authentication

## Goal

Set up secure access to the Singularity web UI and SSH without exposing public ports.

---

## Access Options

| Method | Security | Complexity | Use Case |
|--------|----------|------------|----------|
| SSH Tunnel | High | Low | Development, occasional access |
| IAP TCP Forwarding | High | Medium | Regular access, no public IP |
| IAP + HTTPS | Highest | High | Production, team access |
| Direct IP + Firewall | Medium | Low | Quick setup, single user |

**Recommendation:** Start with SSH tunnel, upgrade to IAP when needed.

---

## Option 1: SSH Tunnel (Simplest)

Access web UI through SSH port forwarding.

### Setup

No additional GCP configuration needed.

### Usage

```bash
# Forward local port 3001 to instance port 3001
gcloud compute ssh singularity-agent \
  --zone=europe-west4-a \
  -- -L 3001:localhost:3001

# Access web UI at http://localhost:3001
```

Create a shell alias for convenience:

```bash
# Add to ~/.bashrc or ~/.zshrc
alias singularity-ui='gcloud compute ssh singularity-agent --zone=europe-west4-a -- -L 3001:localhost:3001'
```

### Pros/Cons

- ✅ No configuration needed
- ✅ Very secure (no public ports)
- ✅ Works immediately
- ❌ Requires active SSH session
- ❌ Single user only

---

## Option 2: IAP TCP Forwarding

Use Identity-Aware Proxy for secure tunneling without public IP.

### Setup

```bash
# Enable IAP API
gcloud services enable iap.googleapis.com

# Create firewall rule for IAP
gcloud compute firewall-rules create allow-iap-ssh \
  --direction=INGRESS \
  --priority=1000 \
  --network=default \
  --action=ALLOW \
  --rules=tcp:22 \
  --source-ranges=35.235.240.0/20 \
  --target-tags=singularity

# Remove external IP (optional, for extra security)
gcloud compute instances delete-access-config singularity-agent \
  --zone=europe-west4-a \
  --access-config-name="external-nat"
```

### Usage

```bash
# SSH through IAP
gcloud compute ssh singularity-agent \
  --zone=europe-west4-a \
  --tunnel-through-iap

# Port forward through IAP
gcloud compute ssh singularity-agent \
  --zone=europe-west4-a \
  --tunnel-through-iap \
  -- -L 3001:localhost:3001
```

### Pros/Cons

- ✅ No public IP needed
- ✅ GCP-managed security
- ✅ Audit logging
- ❌ Slightly slower than direct SSH
- ❌ Requires gcloud CLI

---

## Option 3: Direct IP + Firewall (Quick Setup)

Expose port 3001 directly but restrict to your IP.

### Setup

```bash
# Get your public IP
MY_IP=$(curl -s ifconfig.me)

# Create firewall rule
gcloud compute firewall-rules create allow-singularity-ui \
  --direction=INGRESS \
  --priority=1000 \
  --network=default \
  --action=ALLOW \
  --rules=tcp:3001 \
  --source-ranges=$MY_IP/32 \
  --target-tags=singularity
```

### Usage

```bash
# Get instance external IP
gcloud compute instances describe singularity-agent \
  --zone=europe-west4-a \
  --format='get(networkInterfaces[0].accessConfigs[0].natIP)'

# Access directly
# http://INSTANCE_IP:3001
```

### Update IP When It Changes

```bash
# Get new IP and update firewall rule
MY_IP=$(curl -s ifconfig.me)
gcloud compute firewall-rules update allow-singularity-ui \
  --source-ranges=$MY_IP/32
```

### Pros/Cons

- ✅ Direct access, no tunnel needed
- ✅ Simple setup
- ❌ IP changes require firewall updates
- ❌ Less secure than tunneling
- ❌ Exposes port publicly (to your IP)

---

## Authentication Token

Add an authentication token to the control plane for API security.

### Configure

In `/opt/singularity/.env` on the instance:

```bash
CONTROL_PLANE_TOKEN=your-secret-token
```

Restart containers:

```bash
docker-compose down && docker-compose up -d
```

### Usage

All API requests require the token:

```bash
curl -H "Authorization: Bearer your-secret-token" \
  http://localhost:3001/api/status
```

The web UI will prompt for the token on first access.

---

## Telegram Security

Telegram bot access is already secure:

- Bot only responds to configured `TELEGRAM_CHAT_ID`
- Polling is outbound-only (no inbound ports needed)
- Messages are encrypted by Telegram

No additional configuration needed.

---

## Recommended Setup

For a single-user setup:

1. **Start with SSH tunnel** - works immediately, very secure
2. **Add auth token** - protects API if you accidentally expose it
3. **Upgrade to IAP** later if you want no public IP

```bash
# Quick start: SSH tunnel + web UI
gcloud compute ssh singularity-agent \
  --zone=europe-west4-a \
  -- -L 3001:localhost:3001

# Then open http://localhost:3001 in browser
```

---

## Troubleshooting

### IAP permission denied

```bash
# Grant yourself IAP tunnel access
gcloud projects add-iam-policy-binding PROJECT_ID \
  --member=user:YOUR_EMAIL \
  --role=roles/iap.tunnelResourceAccessor
```

### Firewall rule not working

```bash
# Check rule exists
gcloud compute firewall-rules list --filter="name=allow-singularity-ui"

# Check instance has the correct tag
gcloud compute instances describe singularity-agent \
  --zone=europe-west4-a \
  --format='get(tags.items)'
```

### Can't access after IP change

```bash
# Update firewall with new IP
MY_IP=$(curl -s ifconfig.me)
gcloud compute firewall-rules update allow-singularity-ui \
  --source-ranges=$MY_IP/32
```
