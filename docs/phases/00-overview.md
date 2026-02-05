# Phase 0: Cloud Deployment Overview

## Goal

Deploy Singularity to Google Cloud so the agent runs 24/7 without depending on local machine.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Google Cloud (europe-west4)                      │
├─────────────────────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                    GCE Instance (e2-small)                      │ │
│  │                                                                 │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │ │
│  │  │  Agent      │  │  Vector     │  │  Control Plane          │ │ │
│  │  │  Container  │  │  Container  │  │  + Web UI               │ │ │
│  │  │             │  │             │  │  Port 3001              │ │ │
│  │  └─────────────┘  └─────────────┘  └─────────────────────────┘ │ │
│  │                                                                 │ │
│  │  ┌─────────────────────────────────────────────────────────┐   │ │
│  │  │              Persistent Disk                             │   │ │
│  │  │   /opt/singularity/agent/  (memory, tasks, etc.)        │   │ │
│  │  └─────────────────────────────────────────────────────────┘   │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌─────────────────────┐                                            │
│  │  Artifact Registry  │  (Container images)                        │
│  └─────────────────────┘                                            │
└─────────────────────────────────────────────────────────────────────┘
          │                               │
          │ gcloud SSH / IAP              │ Telegram API (outbound)
          │                               │
    ┌─────▼─────┐                   ┌─────▼─────┐
    │  Tommi's  │                   │  Telegram │
    │  Laptop   │                   │  Servers  │
    └───────────┘                   └───────────┘
```

---

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Cloud Provider | Google Cloud | Free tier, gcloud CLI, IAP for secure access |
| Instance Size | e2-small (2GB) | Minimal cost, sufficient for workload |
| Region | europe-west4 (Netherlands) | Low latency from Helsinki |
| Access Method | gcloud SSH + IAP | Secure, no public IP needed |
| Container Registry | Artifact Registry | Native GCP, no extra config |
| Backup Strategy | rsync to local | Simple, reliable, timestamped |

---

## Cost Projection

| Component | Monthly Cost |
|-----------|-------------|
| GCE e2-small | ~$12-15 |
| Persistent Disk (20GB) | ~$2-4 |
| Egress (minimal) | ~$1-2 |
| Artifact Registry | Free tier |
| **Total** | **~$15-21/month** |

*Note: GCP pricing is usage-based. Costs may vary.*

---

## Phase Summary

| Phase | Description | Status |
|-------|-------------|--------|
| [Phase 1](01-local-docker.md) | Local Docker setup | ✅ Complete |
| [Phase 2](02-persistent-data.md) | Persistent volumes | ✅ Complete |
| [Phase 3](03-cloud-deployment.md) | GCE instance + containers | Planned |
| [Phase 4](04-ci-cd.md) | Automated deployments | Planned |
| [Phase 5](05-access-authentication.md) | Secure access via IAP | Planned |

---

## Prerequisites

- Google Cloud account with billing enabled
- `gcloud` CLI installed locally
- Docker and docker-compose working locally
- Telegram bot token and chat ID configured
