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

## Communication Integrations (Required for Full Features)

### Email (SendGrid) ⭐ CRITICAL

Required for: Email notifications, portfolio summaries, Plaid link delivery

| Variable | Required | Description |
|----------|----------|-------------|
| `SENDGRID_API_KEY` | ✓ | SendGrid API key |
| `SENDGRID_FROM_EMAIL` | ✓ | Verified sender email address |
| `SENDGRID_FROM_NAME` | | Sender display name (default: "Ferni") |

**Setup:**
1. Create account at [sendgrid.com](https://sendgrid.com)
2. Verify a sender email address
3. Create an API key with "Mail Send" permission
4. Add to `.env`

### SMS (Twilio) ⭐ CRITICAL

Required for: Text reminders, alerts, Plaid link delivery, appointment notifications

| Variable | Required | Description |
|----------|----------|-------------|
| `TWILIO_ACCOUNT_SID` | ✓ | Twilio account SID |
| `TWILIO_AUTH_TOKEN` | ✓ | Twilio auth token |
| `TWILIO_PHONE_NUMBER` | ✓ | Your Twilio phone number (E.164 format) |

**Setup:**
1. Create account at [twilio.com](https://twilio.com)
2. Get a phone number (SMS-enabled)
3. Find Account SID and Auth Token in console
4. Add to `.env`

### Voice Calls (Twilio) ⭐ CRITICAL

Required for: Outbound calls, appointment scheduling calls, voice messages

Uses same Twilio credentials as SMS, plus optional:

| Variable | Required | Description |
|----------|----------|-------------|
| `SIP_TRUNK_ID` | | LiveKit SIP trunk ID for advanced calling |
| `CALLER_ID` | | Override caller ID for outbound calls |

---

## Third-Party Integrations (Optional)

### Google Calendar

Required for: Calendar event creation, appointment reminders, scheduling

| Variable | Description |
|----------|-------------|
| `GOOGLE_CALENDAR_CREDENTIALS` | JSON string with OAuth or Service Account credentials |
| `GOOGLE_CALENDAR_ID` | Calendar ID to use (default: "primary") |

**Option A: OAuth Credentials (for personal calendars)**
```json
{
  "client_id": "xxx.apps.googleusercontent.com",
  "client_secret": "xxx",
  "refresh_token": "xxx"
}
```

**Option B: Service Account (for shared calendars)**
```json
{
  "type": "service_account",
  "project_id": "xxx",
  "private_key_id": "xxx",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...",
  "client_email": "xxx@xxx.iam.gserviceaccount.com"
}
```

### Restaurant Reservations

Optional APIs for instant online reservations (without phone calls):

| Variable | Description |
|----------|-------------|
| `OPENTABLE_API_KEY` | OpenTable Partner API key |
| `RESY_API_KEY` | Resy API key |
| `YELP_API_KEY` | Yelp Fusion API key (for search + some reservations) |

Without these, reservations fall back to phone calls via Twilio.

### Plaid (Banking)

| Variable | Description |
|----------|-------------|
| `PLAID_CLIENT_ID` | Plaid client ID |
| `PLAID_SECRET` | Plaid secret key |
| `PLAID_ENV` | Environment: `sandbox`, `development`, `production` |
| `PLAID_LINK_BASE_URL` | URL for hosted Plaid Link page |

### Spotify (Music)

| Variable | Description |
|----------|-------------|
| `MUSIC_ENABLED` | Master toggle: `true` to enable music features |
| `SPOTIFY_CLIENT_ID` | Spotify app client ID |
| `SPOTIFY_CLIENT_SECRET` | Spotify app secret |
| `SPOTIFY_REFRESH_TOKEN` | User's refresh token (get via `node scripts/spotify-auth.js`) |
| `SPOTIFY_REDIRECT_URI` | OAuth callback URL for production (e.g., `https://app.ferni.ai/spotify/callback`) |

**Setup for Production:**
1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Add redirect URI matching your production URL
3. Set `SPOTIFY_REDIRECT_URI` environment variable to match

---

## Push Notifications (Web Push)

Required for: Browser push notifications, engagement reminders, streak celebrations

| Variable | Required | Description |
|----------|----------|-------------|
| `VAPID_PUBLIC_KEY` | ✓ | VAPID public key for web push |
| `VAPID_PRIVATE_KEY` | ✓ | VAPID private key (keep secret!) |
| `VAPID_SUBJECT` | | Contact email/URL (default: `mailto:hello@ferni.ai`) |

**Generate Keys:**
```bash
npx ts-node scripts/generate-vapid-keys.ts
```

**Frontend Environment:**
Also set in your frontend build:
```bash
VITE_VAPID_PUBLIC_KEY=<your-public-key>
```

---

## Agent Marketplace

Required for: Installing agents from the voiceai-agents GitHub repository

| Variable | Required | Description |
|----------|----------|-------------|
| `GITHUB_MARKETPLACE_TOKEN` | ✓ | GitHub Personal Access Token with `repo` scope |

**Setup:**
1. Go to [GitHub Settings > Developer settings > Personal access tokens](https://github.com/settings/tokens)
2. Create a new token with `repo` scope (for private repos) or `public_repo` (for public only)
3. Add to `.env`

Without this token, the marketplace uses local files (dev mode) instead of the GitHub repo.

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
# ============================================================================
# REQUIRED - Core Services
# ============================================================================

# LiveKit (Voice Communication)
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=APIxxxxxxxx
LIVEKIT_API_SECRET=xxxxxxxxxxxx

# AI Services
GOOGLE_API_KEY=AIza...
CARTESIA_API_KEY=sk-...

# ============================================================================
# RECOMMENDED - Production Features
# ============================================================================

# Push Notifications (generate with: npx ts-node scripts/generate-vapid-keys.ts)
VAPID_PUBLIC_KEY=BEl62iUYgUivxIkv69yViEuiBIa...
VAPID_PRIVATE_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxx
VAPID_SUBJECT=mailto:hello@ferni.ai

# Agent Marketplace (GitHub PAT with repo scope)
GITHUB_MARKETPLACE_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx

# Communication (SendGrid + Twilio)
SENDGRID_API_KEY=SG.xxxxx
SENDGRID_FROM_EMAIL=hello@ferni.ai
TWILIO_ACCOUNT_SID=ACxxxxx
TWILIO_AUTH_TOKEN=xxxxx
TWILIO_PHONE_NUMBER=+1234567890

# ============================================================================
# OPTIONAL - Additional Features
# ============================================================================

# Voice IDs (defaults in manifests)
JACK_B_VOICE_ID=fdeb5d75-4f2e-4224-9e98-6aa6aa1188bc
JACK_BOGLE_VOICE_ID=9c10dc48-8799-42f9-a72a-0c7dfe13a06d

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/voiceai
REDIS_URL=redis://localhost:6379

# Plaid (Banking)
PLAID_CLIENT_ID=...
PLAID_SECRET=...
PLAID_ENV=sandbox

# Spotify (Music)
SPOTIFY_CLIENT_ID=...
SPOTIFY_CLIENT_SECRET=...

# ============================================================================
# DEVELOPMENT
# ============================================================================

NODE_ENV=development
PORT=3003
DEBUG_CONTEXT=false
LOG_LEVEL=info
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

## Testing & Validation Variables

For running integration tests with real APIs:

| Variable | Description |
|----------|-------------|
| `TEST_EMAIL` | Email address to receive test emails |
| `TEST_PHONE_NUMBER` | Phone number to receive test SMS (E.164 format) |
| `TEST_BUSINESS_PHONE` | Phone number for testing appointment calls |
| `SCHEDULING_TEST_MODE` | Set to `real` to make actual appointment calls |

---

## Validating Configuration

### Quick Check
```bash
# Validate all integrations
npx ts-node scripts/validate-integrations.ts

# With actual test messages (requires TEST_EMAIL and TEST_PHONE_NUMBER)
npx ts-node scripts/validate-integrations.ts --send-test
```

### Run E2E Integration Tests
```bash
# Communication tests (email, SMS, calls)
npx vitest run src/tests/integrations/communication-e2e.test.ts

# Scheduling tests (appointments, reservations)
npx vitest run src/tests/integrations/scheduling-e2e.test.ts
```

### Manual Check
```bash
echo $LIVEKIT_URL
echo $GOOGLE_API_KEY
echo $SENDGRID_API_KEY
echo $TWILIO_ACCOUNT_SID
```

---

## Production Readiness Checklist

### ✅ Core (Required)
- [ ] `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`
- [ ] `GOOGLE_API_KEY` (Gemini LLM)
- [ ] `CARTESIA_API_KEY` (TTS)

### ✅ Communication (Required for full features)
- [ ] `SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL`
- [ ] `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`

### 🟡 Recommended
- [ ] `DATABASE_URL` or `GOOGLE_CLOUD_PROJECT` (persistence)
- [ ] `GOOGLE_CALENDAR_CREDENTIALS` (scheduling)
- [ ] `REDIS_URL` (caching)
- [ ] `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (push notifications)
- [ ] `GITHUB_MARKETPLACE_TOKEN` (agent marketplace)

### ⚪ Optional
- [ ] `PLAID_*` (banking)
- [ ] `SPOTIFY_*` (music)
- [ ] `OPENTABLE_API_KEY`, `RESY_API_KEY`, `YELP_API_KEY` (reservations)
