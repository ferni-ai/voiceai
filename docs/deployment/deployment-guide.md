# Deployment Guide

Complete guide for deploying the Ferni Voice AI Platform.

## Architecture Overview

```
                                    ┌─────────────────────┐
                                    │   Firebase Hosting  │
                                    │   (Static Frontend) │
                                    └──────────┬──────────┘
                                               │
                    ┌──────────────────────────┼──────────────────────────┐
                    │                          │                          │
                    ▼                          ▼                          ▼
        ┌───────────────────┐    ┌───────────────────┐    ┌───────────────────┐
        │   Cloud Run       │    │   Cloud Run       │    │   LiveKit Cloud   │
        │   (UI Server)     │    │   (Voice Agent)   │    │   (WebRTC)        │
        └───────────────────┘    └───────────────────┘    └───────────────────┘
                    │                          │
                    ▼                          ▼
        ┌───────────────────────────────────────────────────────────────────┐
        │                      Firestore / PostgreSQL                       │
        └───────────────────────────────────────────────────────────────────┘
```

---

## Prerequisites

1. **Google Cloud Account** with billing enabled
2. **LiveKit Cloud Account** - https://cloud.livekit.io
3. **API Keys:**
   - Google Gemini API key
   - Cartesia API key
   - (Optional) OpenAI API key for embeddings
   - (Optional) Spotify Developer credentials
   - (Optional) Plaid API credentials

---

## Environment Setup

### 1. Backend Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
# Required: LiveKit credentials
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your_api_key
LIVEKIT_API_SECRET=your_api_secret

# Required: AI Models
GOOGLE_API_KEY=your_google_api_key
CARTESIA_API_KEY=your_cartesia_api_key

# Optional: OpenAI for embeddings
OPENAI_API_KEY=your_openai_api_key

# Storage: Choose one
MEMORY_STORE_TYPE=firestore  # or postgres
GOOGLE_CLOUD_PROJECT=your-gcp-project-id

# For PostgreSQL alternative:
# DATABASE_URL=postgres://user:password@host:5432/database
```

### 2. Frontend Environment Variables

Copy `frontend-typescript/.env.example` to `.env.local`:

```bash
# Development proxy targets
VITE_TOKEN_SERVER_URL=http://localhost:3001
VITE_UI_SERVER_URL=http://localhost:3002
VITE_DEV_PORT=3004

# Push notifications (generate with: npx web-push generate-vapid-keys)
VITE_VAPID_PUBLIC_KEY=your-vapid-public-key
```

---

## Local Development

### Quick Start

```bash
# Install dependencies
npm install
cd frontend-typescript && npm install && cd ..

# Build backend
npm run build

# Start all services (3 terminals)
node token-server.js          # Terminal 1 - Token server (port 3001)
node ui-server.js             # Terminal 2 - UI server (port 3002)
cd frontend-typescript && npm run dev  # Terminal 3 - Frontend (port 3004)

# Start voice agent
npm run dev:ferni             # Or another persona
```

### Using Docker Compose

```bash
# Start all services
docker-compose -f docker-compose.local.yml up

# With specific persona
PERSONA_ID=ferni docker-compose -f docker-compose.local.yml up
```

---

## Production Deployment

### 1. Deploy Voice Agent to Cloud Run

The voice agent runs as a Docker container on Cloud Run.

#### Option A: Cloud Build (Recommended)

```bash
# Submit build to Cloud Build
gcloud builds submit --config=cloudbuild.yaml

# Deploy to Cloud Run
gcloud run deploy voice-agent \
  --image gcr.io/$PROJECT_ID/bogle-voice-agent:latest \
  --platform managed \
  --region us-central1 \
  --set-env-vars="LIVEKIT_URL=$LIVEKIT_URL,LIVEKIT_API_KEY=$LIVEKIT_API_KEY" \
  --set-secrets="LIVEKIT_API_SECRET=livekit-secret:latest,GOOGLE_API_KEY=google-api-key:latest,CARTESIA_API_KEY=cartesia-key:latest"
```

#### Option B: Manual Docker Build

```bash
# Build locally
docker build -t gcr.io/$PROJECT_ID/bogle-voice-agent:latest .

# Push to Container Registry
docker push gcr.io/$PROJECT_ID/bogle-voice-agent:latest

# Deploy
gcloud run deploy voice-agent \
  --image gcr.io/$PROJECT_ID/bogle-voice-agent:latest \
  --region us-central1
```

### 2. Deploy UI Server to Cloud Run

```bash
# Build UI server image
docker build -f Dockerfile.ui -t gcr.io/$PROJECT_ID/bogle-ui:latest .

# Push and deploy
docker push gcr.io/$PROJECT_ID/bogle-ui:latest

gcloud run deploy bogle-ui \
  --image gcr.io/$PROJECT_ID/bogle-ui:latest \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars="..." \
  --set-secrets="..."
```

### 3. Deploy Frontend to Firebase Hosting

```bash
cd frontend-typescript

# Build the frontend
npm run build

# Deploy to Firebase
firebase deploy --only hosting:ferni-prod

# Or for staging
firebase deploy --only hosting:johnb-app
```

### 4. Configure Firebase Hosting Rewrites

The `firebase.json` already configures rewrites to Cloud Run:

```json
{
  "rewrites": [
    {
      "source": "/token",
      "run": { "serviceId": "bogle-ui", "region": "us-central1" }
    },
    {
      "source": "/spotify/**",
      "run": { "serviceId": "bogle-ui", "region": "us-central1" }
    },
    {
      "source": "**",
      "destination": "/index.html"
    }
  ]
}
```

---

## LiveKit Configuration

### 1. Create LiveKit Cloud Project

1. Go to https://cloud.livekit.io
2. Create a new project
3. Note the WebSocket URL and API credentials

### 2. Configure Agent Dispatch

LiveKit agents are auto-dispatched when participants join rooms. Configure in the LiveKit dashboard:

- **Agent Name:** `voice-agent`
- **Room Prefix:** `ferni-*` (or your prefix)

### 3. Enable Egress (Optional)

For recording/streaming capabilities:
1. Enable Egress in LiveKit dashboard
2. Configure S3/GCS bucket for recordings

---

## Database Setup

### Option A: Firestore (Recommended)

1. Enable Firestore in your GCP project
2. Create database in production mode
3. Set `MEMORY_STORE_TYPE=firestore` and `GOOGLE_CLOUD_PROJECT`

Firestore collections are auto-created:
- `user_profiles`
- `conversation_summaries`
- `key_moments`
- `ritual_streaks`
- `engagement_data`

### Option B: PostgreSQL

```bash
# Create database
createdb ferni_production

# Set connection string
export DATABASE_URL=postgres://user:pass@host:5432/ferni_production

# Tables are auto-created on first connection
```

---

## Secret Management

Use Google Secret Manager for sensitive values:

```bash
# Create secrets
gcloud secrets create livekit-secret --data-file=- <<< "your-secret"
gcloud secrets create google-api-key --data-file=- <<< "your-key"
gcloud secrets create cartesia-key --data-file=- <<< "your-key"

# Grant access to Cloud Run service account
gcloud secrets add-iam-policy-binding livekit-secret \
  --member="serviceAccount:PROJECT_NUMBER-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

Reference in Cloud Run:
```bash
--set-secrets="LIVEKIT_API_SECRET=livekit-secret:latest"
```

---

## Monitoring & Alerts

### Cloud Run Metrics

Monitor these in Google Cloud Console:
- Request latency
- Instance count
- Memory usage
- Error rate

### Custom Alerts

Deploy alert policies from `monitoring/alerts.yaml`:

```bash
gcloud alpha monitoring policies create --policy-from-file=monitoring/alerts.yaml
```

### Health Checks

- Voice Agent: `GET /health` on port 8080
- UI Server: `GET /health`
- Frontend: Firebase automatically checks

---

## CI/CD Pipeline

### GitHub Actions (Recommended)

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy
on:
  push:
    branches: [main]

jobs:
  deploy-agent:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: google-github-actions/auth@v2
        with:
          credentials_json: ${{ secrets.GCP_SA_KEY }}
      - uses: google-github-actions/setup-gcloud@v2
      - run: gcloud builds submit --config=cloudbuild.yaml

  deploy-frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
        working-directory: frontend-typescript
      - run: npm run build
        working-directory: frontend-typescript
      - uses: FirebaseExtended/action-hosting-deploy@v0
        with:
          repoToken: ${{ secrets.GITHUB_TOKEN }}
          firebaseServiceAccount: ${{ secrets.FIREBASE_SA }}
          channelId: live
          entryPoint: frontend-typescript
```

---

## Rollback Procedures

### Cloud Run

```bash
# List revisions
gcloud run revisions list --service=voice-agent

# Rollback to previous revision
gcloud run services update-traffic voice-agent \
  --to-revisions=voice-agent-00002-abc=100
```

### Firebase Hosting

```bash
# List recent deploys
firebase hosting:channel:list

# Rollback (redeploy previous version)
firebase hosting:clone ferni-prod:previous ferni-prod:live
```

---

## Troubleshooting

### Voice Agent Won't Start

1. Check logs: `gcloud run logs read --service=voice-agent`
2. Verify environment variables are set
3. Check LiveKit credentials are valid
4. Ensure Cartesia API key is active

### Frontend Can't Connect

1. Check Firebase Hosting rewrites configuration
2. Verify Cloud Run service is public (`--allow-unauthenticated`)
3. Check CORS configuration in UI server
4. Verify LiveKit URL is correct in token response

### Database Connection Issues

1. Check `MEMORY_STORE_TYPE` is set correctly
2. For Firestore: ensure `GOOGLE_CLOUD_PROJECT` is set
3. For PostgreSQL: verify `DATABASE_URL` connection string
4. Check IAM permissions for service account

### Memory/Performance Issues

1. Increase Cloud Run memory: `--memory=2Gi`
2. Increase CPU: `--cpu=2`
3. Enable min instances: `--min-instances=1`
4. Check for memory leaks in logs

---

## Scaling Configuration

### Cloud Run Autoscaling

```bash
gcloud run services update voice-agent \
  --min-instances=1 \
  --max-instances=10 \
  --concurrency=10 \
  --cpu=2 \
  --memory=2Gi
```

### Recommended Settings

| Service | Min | Max | CPU | Memory | Concurrency |
|---------|-----|-----|-----|--------|-------------|
| Voice Agent | 1 | 10 | 2 | 2Gi | 10 |
| UI Server | 0 | 20 | 1 | 512Mi | 80 |

---

## Security Checklist

- [ ] All secrets in Secret Manager (not env vars)
- [ ] CORS restricted to production domains
- [ ] HTTPS enforced (Firebase Hosting default)
- [ ] Service accounts have minimal permissions
- [ ] Rate limiting configured
- [ ] Logging enabled for audit trail
- [ ] Regular `npm audit` runs

See `docs/security-review.md` for detailed security recommendations.

---

## Support Resources

- **LiveKit Docs:** https://docs.livekit.io
- **Firebase Hosting:** https://firebase.google.com/docs/hosting
- **Cloud Run:** https://cloud.google.com/run/docs
- **Firestore:** https://cloud.google.com/firestore/docs
