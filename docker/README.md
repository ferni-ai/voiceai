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

### Required for Voice Agent

```bash
LIVEKIT_URL=wss://your-livekit-server.com
LIVEKIT_API_KEY=your-api-key
LIVEKIT_API_SECRET=your-api-secret
GOOGLE_API_KEY=your-gemini-key
CARTESIA_API_KEY=your-cartesia-key
PERSONA_ID=ferni  # or jack-bogle, peter-lynch, etc.
```

### Required for UI Server

```bash
LIVEKIT_URL=wss://your-livekit-server.com
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

