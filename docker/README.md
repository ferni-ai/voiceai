# 🐳 Docker Configuration

This directory contains modular Dockerfiles for all Ferni services.

## Available Images

| Dockerfile | Service | Description |
|------------|---------|-------------|
| `Dockerfile.agent` | Voice Agent | LiveKit voice agent (all personas) |
| `Dockerfile.ui` | UI Server | Main frontend + API server |
| `Dockerfile.landing` | Landing Page | Lightweight promo page + tokens |
| `Dockerfile.base` | Base Image | Shared base (optional) |

## Quick Start

### Build All Images

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

### Run Locally

```bash
# Voice Agent (requires LiveKit credentials)
docker run -p 8080:8080 \
  -e LIVEKIT_URL=$LIVEKIT_URL \
  -e LIVEKIT_API_KEY=$LIVEKIT_API_KEY \
  -e LIVEKIT_API_SECRET=$LIVEKIT_API_SECRET \
  -e PERSONA_ID=ferni \
  ferni-agent

# UI Server
docker run -p 8080:8080 \
  -e LIVEKIT_URL=$LIVEKIT_URL \
  -e LIVEKIT_API_KEY=$LIVEKIT_API_KEY \
  -e LIVEKIT_API_SECRET=$LIVEKIT_API_SECRET \
  ferni-ui
```

## Build Arguments

### Dockerfile.landing

| Arg | Default | Description |
|-----|---------|-------------|
| `LANDING_DIR` | `promo/meet-joel` | Path to landing page content |
| `NODE_VERSION` | `20` | Node.js version |

### All Dockerfiles

| Arg | Default | Description |
|-----|---------|-------------|
| `NODE_VERSION` | `20` | Node.js version |

## Cloud Build

For GCP Cloud Build, see:
- `cloudbuild.yaml` - Voice agent deployment
- `cloudbuild-ui.yaml` - UI server deployment

## Environment Variables

### ⚠️ IMPORTANT: Dev vs Production LiveKit Projects

We have **TWO** separate LiveKit projects to prevent local dev workers from stealing production jobs:

| Environment | LiveKit Project | Subdomain | Use |
|-------------|----------------|-----------|-----|
| **Development** | `ferni-dev` (p_1gcwootg9al) | `dev-8sm1ba0z.livekit.cloud` | Local dev |
| **Production** | `ferni` (test-rvg91u1z) | `test-rvg91u1z.livekit.cloud` | GCE deployment |

### Local Development Setup

Create a `.env` file in the project root with **development** credentials:

```bash
# .env (for local development)
NODE_ENV=development

# DEVELOPMENT LiveKit (ferni-dev project)
LIVEKIT_URL=wss://dev-8sm1ba0z.livekit.cloud
LIVEKIT_API_KEY=<get-from-livekit-cloud-dashboard>
LIVEKIT_API_SECRET=<get-from-livekit-cloud-dashboard>

# Use dev agent name to distinguish from production
AGENT_NAME=voice-agent-dev

GOOGLE_API_KEY=your-gemini-key
CARTESIA_API_KEY=your-cartesia-key
PERSONA_ID=ferni
```

Get dev credentials from: https://cloud.livekit.io/projects/p_1gcwootg9al/settings/keys

### Production (GCE)

Production credentials are stored in **Google Cloud Secret Manager** and injected at runtime.
The deploy script (`ferni deploy gce`) handles this automatically.

```bash
# Production uses these (from Secret Manager):
LIVEKIT_URL=wss://test-rvg91u1z.livekit.cloud
LIVEKIT_API_KEY=<from-secret-manager>
LIVEKIT_API_SECRET=<from-secret-manager>
AGENT_NAME=voice-agent
```

### Required for Voice Agent

```bash
LIVEKIT_URL=wss://dev-8sm1ba0z.livekit.cloud  # Use dev for local
LIVEKIT_API_KEY=your-api-key
LIVEKIT_API_SECRET=your-api-secret
GOOGLE_API_KEY=your-gemini-key
CARTESIA_API_KEY=your-cartesia-key
PERSONA_ID=ferni  # or jack-bogle, peter-lynch, etc.
```

### Required for UI Server

```bash
LIVEKIT_URL=wss://dev-8sm1ba0z.livekit.cloud  # Use dev for local
LIVEKIT_API_KEY=your-api-key
LIVEKIT_API_SECRET=your-api-secret
GCP_PROJECT_ID=your-project
```

## Multi-Architecture Builds

For ARM64 + AMD64 builds:

```bash
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -f docker/Dockerfile.ui \
  -t ferni-ui:latest \
  --push .
```

## Tips

1. **Use `.dockerignore`** - Already configured to exclude node_modules, etc.
2. **Layer caching** - Package files are copied before source for better caching
3. **Multi-stage builds** - All Dockerfiles use multi-stage to minimize image size
4. **Health checks** - All production images include HEALTHCHECK

## Migration from Root Dockerfiles

The root Dockerfiles (`Dockerfile`, `Dockerfile.ui`, `Dockerfile.joel-ui`) are now deprecated.
Use the files in this directory instead:

| Old | New |
|-----|-----|
| `Dockerfile` | `docker/Dockerfile.agent` |
| `Dockerfile.ui` | `docker/Dockerfile.ui` |
| `Dockerfile.joel-ui` | `docker/Dockerfile.landing --build-arg LANDING_DIR=promo/meet-joel` |

