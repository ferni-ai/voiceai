# Ferni Quick Deploy Reference

**Project:** `johnb-2025` | **Region:** `us-central1`

## 🚀 One Command Deploy

```bash
./scripts/deploy-all.sh --all
```

---

## Individual Deployments

| What | Command | Service Name |
|------|---------|--------------|
| Everything | `./scripts/deploy-all.sh --all` | - |
| Voice Agent | `./scripts/deploy-all.sh --agent` | voiceai-agent |
| Frontend App | `./scripts/deploy-all.sh --ui` | john-bogle-ui |
| Landing Page | `./scripts/deploy-all.sh --landing` | (Firebase/GCS) |

---

## Your Existing GCP Setup ✓

**Services Already Running:**
- `voiceai-agent` - Main voice agent
- `john-bogle-ui` - Frontend app
- `bogle-voice-agent` - Legacy agent
- `joel-dickson-agent` - Joel persona
- `evolutionscheduler` - Background tasks

**Secrets Already Configured:** ✓
- google-api-key, cartesia-api-key
- livekit-url, livekit-api-key, livekit-api-secret
- alpha-vantage-key, finnhub-api-key
- sendgrid-api-key, sendgrid-from-email
- spotify-client-id/secret/refresh-token
- twilio-account-sid/auth-token
- plaid-client-id/secret/env

---

## Workflow Diagram

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  1. DESIGN      │ ──► │  2. DEVELOP     │ ──► │  3. DEPLOY      │
│                 │     │                 │     │                 │
│  Brand assets   │     │  npm run dev    │     │  deploy-all.sh  │
│  Prompts        │     │  Test locally   │     │  Cloud Build    │
│  Brand book     │     │  Build          │     │  Cloud Run      │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       │                       │
        ▼                       ▼                       ▼
   /brand/              /src/, /frontend/       GCP Services
```

---

## Local Development

```bash
# Terminal 1: Voice Agent
npm run dev

# Terminal 2: Frontend App
cd frontend-typescript && npm run dev

# Terminal 3: Landing Page
cd promo/ferni-website && python3 -m http.server 8765
```

---

## Service URLs

| Service | Local | Production |
|---------|-------|------------|
| Landing Page | http://localhost:8765 | https://ferni.ai |
| Frontend App | http://localhost:5173 | https://john-bogle-ui-1031920444452.us-central1.run.app |
| Voice Agent | ws://localhost:8080 | https://voiceai-agent-1031920444452.us-central1.run.app |
| Phone | N/A | 1 (484) 481-3081 |

---

## Monitor & Debug

```bash
# View logs
gcloud run services logs read voiceai-agent --region us-central1

# List services
gcloud run services list

# Check service status
gcloud run services describe voiceai-agent --region us-central1
```

---

## Rollback

```bash
# List revisions
gcloud run revisions list --service voiceai-agent --region us-central1

# Rollback
gcloud run services update-traffic voiceai-agent \
  --to-revisions=REVISION_NAME=100 \
  --region us-central1
```

---

## File Reference

| Path | Description |
|------|-------------|
| `/brand/brand-book.html` | Visual brand book (export to PDF) |
| `/brand/ferni-design-tokens.css` | CSS variables |
| `/promo/ferni-website/` | Marketing landing page |
| `/frontend-typescript/` | Web application |
| `/src/` | Voice agent backend |
| `/scripts/deploy-all.sh` | Master deployment script |
| `/docs/FERNI-COMPLETE-GUIDE.md` | Full documentation |

