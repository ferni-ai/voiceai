# Environment Variables Guide

This document lists all environment variables used by the Ferni voice platform.

## Quick Setup

```bash
# Copy example and edit
cp .env.example .env
```

---

## Required Variables

### LiveKit (Voice Communication)

| Variable | Description | Example |
|----------|-------------|---------|
| `LIVEKIT_URL` | LiveKit server URL | `wss://your-project.livekit.cloud` |
| `LIVEKIT_API_KEY` | LiveKit API key | `APIxxxxxxxx` |
| `LIVEKIT_API_SECRET` | LiveKit API secret | `xxxxxxxxxxxx` |

### AI Services

| Variable | Description | Example |
|----------|-------------|---------|
| `GOOGLE_API_KEY` | Google Gemini API key | `AIza...` |
| `CARTESIA_API_KEY` | Cartesia TTS API key | `sk-...` |

---

## Voice IDs (Optional)

Voice IDs can be set in bundle manifests or via environment variables.
Environment variables override manifest defaults.

| Variable | Agent | Description |
|----------|-------|-------------|
| `JACK_B_VOICE_ID` | Ferni | Main life coach voice |
| `JACK_BOGLE_VOICE_ID` | Jack Bogle | Investment sage voice |
| `PETER_LYNCH_VOICE_ID` | Peter Lynch | Stock researcher voice |
| `COMM_SPECIALIST_VOICE_ID` | Alex Chen | Communications voice |
| `SPEND_SAVE_VOICE_ID` | Maya Santos | Budget coach voice |
| `EVENT_PLANNER_VOICE_ID` | Jordan Taylor | Life planner voice |
| `JAGGI_VOICE_ID` | Jaggi Vasudev | Lifetime advisor voice |
| `JOEL_DICKSON_VOICE_ID` | Joel Dickson | Vanguard advisor voice |

### Custom Agent Voice IDs

For custom agents, use the pattern:
```
<AGENT_ID_UPPERCASE>_VOICE_ID
```

Example for agent `tax-expert`:
```bash
TAX_EXPERT_VOICE_ID=your-cartesia-uuid
```

---

## Database (Optional)

### PostgreSQL

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | Full PostgreSQL connection string | (none) |
| `POSTGRES_HOST` | PostgreSQL host | `localhost` |
| `POSTGRES_PORT` | PostgreSQL port | `5432` |
| `POSTGRES_USER` | PostgreSQL user | `postgres` |
| `POSTGRES_PASSWORD` | PostgreSQL password | (none) |
| `POSTGRES_DATABASE` | PostgreSQL database name | `voiceai` |

### Redis

| Variable | Description | Default |
|----------|-------------|---------|
| `REDIS_URL` | Full Redis connection string | (none) |
| `REDIS_HOST` | Redis host | `localhost` |
| `REDIS_PORT` | Redis port | `6379` |
| `REDIS_PASSWORD` | Redis password | (none) |

### Firestore

| Variable | Description | Default |
|----------|-------------|---------|
| `GOOGLE_CLOUD_PROJECT` | GCP project ID | (none) |
| `FIRESTORE_EMULATOR_HOST` | Emulator host for local dev | (none) |

---

## Third-Party Integrations (Optional)

### Plaid (Banking)

| Variable | Description |
|----------|-------------|
| `PLAID_CLIENT_ID` | Plaid client ID |
| `PLAID_SECRET` | Plaid secret key |
| `PLAID_ENV` | Environment: `sandbox`, `development`, `production` |

### Spotify (Music)

| Variable | Description |
|----------|-------------|
| `SPOTIFY_CLIENT_ID` | Spotify app client ID |
| `SPOTIFY_CLIENT_SECRET` | Spotify app secret |
| `SPOTIFY_REFRESH_TOKEN` | User's refresh token |

### Google Calendar

| Variable | Description |
|----------|-------------|
| `GOOGLE_CALENDAR_CLIENT_ID` | OAuth client ID |
| `GOOGLE_CALENDAR_CLIENT_SECRET` | OAuth client secret |
| `GOOGLE_CALENDAR_REFRESH_TOKEN` | User's refresh token |

### Email (Gmail)

| Variable | Description |
|----------|-------------|
| `GMAIL_CLIENT_ID` | OAuth client ID |
| `GMAIL_CLIENT_SECRET` | OAuth client secret |
| `GMAIL_REFRESH_TOKEN` | User's refresh token |

---

## Server Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3003` |
| `NODE_ENV` | Environment | `development` |
| `AGENT_NAME` | Agent name for dispatch | `voice-agent` |

---

## Development Options

| Variable | Description | Default |
|----------|-------------|---------|
| `DEBUG_CONTEXT` | Log context builder output | `false` |
| `DEBUG_MEMORY` | Log memory operations | `false` |
| `LOG_LEVEL` | Logging level | `info` |
| `PERSONA_ID` | Override default persona | `ferni` |

---

## Bundle Manifest Environment Variables

In `persona.manifest.json`, you can reference environment variables:

```json
"voice_id": "${env:MY_VOICE_ID}"
```

With default fallback:
```json
"voice_id": "${env:MY_VOICE_ID|default-uuid-here}"
```

This allows different voice IDs per environment:
- Development: Use test voices
- Production: Use production voices

---

## Example .env File

```bash
# Required
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=APIxxxxxxxx
LIVEKIT_API_SECRET=xxxxxxxxxxxx
GOOGLE_API_KEY=AIza...
CARTESIA_API_KEY=sk-...

# Voice IDs (optional - defaults in manifests)
JACK_B_VOICE_ID=fdeb5d75-4f2e-4224-9e98-6aa6aa1188bc
JACK_BOGLE_VOICE_ID=9c10dc48-8799-42f9-a72a-0c7dfe13a06d

# Database (optional)
DATABASE_URL=postgresql://user:pass@localhost:5432/voiceai
REDIS_URL=redis://localhost:6379

# Integrations (optional)
PLAID_CLIENT_ID=...
PLAID_SECRET=...
SPOTIFY_CLIENT_ID=...
SPOTIFY_CLIENT_SECRET=...

# Development
NODE_ENV=development
DEBUG_CONTEXT=false
```

---

## Google Cloud Deployment

For Cloud Run deployments, set secrets via:

```bash
# Create secret
echo -n "your-api-key" | gcloud secrets create MY_SECRET --data-file=-

# Grant access to Cloud Run
gcloud secrets add-iam-policy-binding MY_SECRET \
  --member="serviceAccount:YOUR_SERVICE_ACCOUNT" \
  --role="roles/secretmanager.secretAccessor"
```

Or use the upload script:
```bash
./scripts/upload-secrets-gcp.sh
```

---

## Validating Configuration

Check required variables are set:
```bash
npm run validate:config  # (if available)
```

Or manually check:
```bash
echo $LIVEKIT_URL
echo $GOOGLE_API_KEY
```
