# Docker Configuration

**Modular Dockerfiles** for all Ferni services.

## Available Dockerfiles

| File | Service | Description |
|------|---------|-------------|
| `Dockerfile.agent` | Voice Agent | LiveKit voice agent (all personas) - deploys to GCE |
| `Dockerfile.ui` | UI Server | Main frontend + API server - deploys to Cloud Run |
| `Dockerfile.landing` | Landing Page | Lightweight promo page + tokens |
| `Dockerfile.base` | Base Image | Shared base (optional) |
| `Dockerfile.speaker` | Speaker Service | TTS service |
| `Dockerfile.outreach` | Outreach | Proactive outreach worker |
| `Dockerfile.context` | Context Service | Context building service |

## Quick Build Commands

```bash
# Voice Agent
docker build -f docker/Dockerfile.agent -t ferni-agent .

# UI Server
docker build -f docker/Dockerfile.ui -t ferni-ui .

# Landing Page (with custom content)
docker build -f docker/Dockerfile.landing \
  --build-arg LANDING_DIR=promo/meet-joel \
  -t ferni-landing .
```

## CRITICAL: Dev vs Production LiveKit

**Two separate LiveKit projects** prevent local workers from stealing production jobs:

| Environment | LiveKit Project | Subdomain |
|-------------|----------------|-----------|
| **Development** | `ferni-dev` | `dev-8sm1ba0z.livekit.cloud` |
| **Production** | `ferni` | `test-rvg91u1z.livekit.cloud` |

## Required Environment Variables

### Voice Agent
```bash
LIVEKIT_URL=wss://dev-8sm1ba0z.livekit.cloud  # Use dev for local
LIVEKIT_API_KEY=your-api-key
LIVEKIT_API_SECRET=your-api-secret
GOOGLE_API_KEY=your-gemini-key
CARTESIA_API_KEY=your-cartesia-key
PERSONA_ID=ferni
```

### UI Server
```bash
LIVEKIT_URL=wss://dev-8sm1ba0z.livekit.cloud
LIVEKIT_API_KEY=your-api-key
LIVEKIT_API_SECRET=your-api-secret
GCP_PROJECT_ID=your-project
```

## Deployment

**NEVER use docker commands directly for deployment!**

Always use the Ferni CLI:
```bash
ferni deploy gce        # Voice agent to GCE
ferni deploy ui         # UI server to Cloud Run
ferni deploy landing    # Landing page
```

The Ferni CLI handles:
- Blue-green deployment
- Health checks (`/health/ready`)
- Automatic rollback on failure
- Zombie revision cleanup

## Cloud Build Files

- `cloudbuild.yaml` - Voice agent deployment (root)
- `cloudbuild-ui.yaml` - UI server deployment (root)
