# Ferni Complete Guide
## From Soup to Nuts: Design, Build, Deploy

**Version 1.0 | December 2024**

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Brand & Design System](#2-brand--design-system)
3. [Development Environment](#3-development-environment)
4. [Landing Page (Marketing Site)](#4-landing-page-marketing-site)
5. [Frontend App](#5-frontend-app)
6. [Backend AI Agent](#6-backend-ai-agent)
7. [Google Cloud Setup](#7-google-cloud-setup)
8. [Deployment Workflows](#8-deployment-workflows)
9. [CI/CD Automation](#9-cicd-automation)
10. [Monitoring & Maintenance](#10-monitoring--maintenance)
11. [Quick Reference](#11-quick-reference)

---

## 1. Architecture Overview

### System Components

```
┌─────────────────────────────────────────────────────────────────────┐
│                         FERNI ECOSYSTEM                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────────┐    ┌──────────────────┐    ┌────────────────┐ │
│  │   LANDING PAGE   │    │   FRONTEND APP   │    │  VOICE AGENT   │ │
│  │  ferni.ai        │    │  app.ferni.ai    │    │  (LiveKit)     │ │
│  │                  │    │                  │    │                │ │
│  │  • Marketing     │    │  • Real-time     │    │  • AI Brain    │ │
│  │  • Brand story   │    │    voice chat    │    │  • 6 Personas  │ │
│  │  • Conversion    │    │  • Team panel    │    │  • Memory      │ │
│  └────────┬─────────┘    └────────┬─────────┘    └────────┬───────┘ │
│           │                       │                       │          │
│           │                       ▼                       │          │
│           │              ┌──────────────────┐            │          │
│           │              │    LIVEKIT       │◄───────────┘          │
│           │              │  (WebRTC)        │                       │
│           │              └──────────────────┘                       │
│           │                       │                                  │
│           ▼                       ▼                                  │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                    GOOGLE CLOUD PLATFORM                      │   │
│  │                                                               │   │
│  │  Cloud Run    │  Firestore   │  Secret Manager  │  Cloud Build│   │
│  │  (Services)   │  (Memory)    │  (API Keys)      │  (CI/CD)   │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Directory Structure

```
/voiceai/
├── brand/                    # Brand assets & guidelines
│   ├── FERNI-SCREEN-GUIDELINES.md
│   ├── brand-book.html       # PDF-exportable brand book
│   ├── ferni-design-tokens.css
│   └── logos/
│
├── apps/website/ferni-website/      # Marketing landing page
│   ├── index.html
│   ├── css/styles.css
│   ├── js/main.js
│   └── images/
│
├── apps/web/      # Main app (app.ferni.ai)
│   ├── src/
│   ├── dist/
│   └── vite.config.ts
│
├── src/                      # Voice agent (backend)
│   ├── agent.ts
│   ├── personas/
│   └── services/
│
├── scripts/                  # Deployment scripts
│   ├── deploy-gcp.sh
│   ├── deploy-ui.sh
│   └── setup-local.sh
│
├── docs/                     # Documentation
│   └── FERNI-COMPLETE-GUIDE.md (this file)
│
├── Dockerfile                # Agent container
├── Dockerfile.ui             # UI container
├── cloudbuild.yaml           # Agent build config
└── cloudbuild-ui.yaml        # UI build config
```

---

## 2. Brand & Design System

### Brand Files

| File | Purpose |
|------|---------|
| `/design-system/brand/FERNI-SCREEN-GUIDELINES.md` | Complete design system (typography, colors, spacing) |
| `/design-system/brand/FERNI-BRAND-GUIDELINES.md` | Brand voice, values, personality |
| `/brand/ferni-design-tokens.css` | CSS custom properties for implementation |
| `/brand/brand-book.html` | Visual brand book (print to PDF) |

### Core Design Tokens

```css
/* Colors */
--color-bg: #F5F1E8;           /* Paper Cream */
--color-text: #2C2520;         /* Natural Ink */
--color-accent: #3D5A45;       /* Forest Green */

/* Typography */
--font-display: 'Plus Jakarta Sans';
--font-body: 'Inter';

/* Persona Colors */
--color-ferni: #4a6741;        /* Deep Sage */
--color-jack: #9a7b5a;         /* Warm Cedar */
--color-peter: #3a6b73;        /* Ocean Teal */
--color-alex: #5a6b8a;         /* Soft Indigo */
--color-maya: #a67a6a;         /* Dusty Terracotta */
--color-jordan: #c4856a;       /* Warm Sunset */
```

### Creating Brand Assets

1. **Generate avatars** using prompts in `/apps/website/ferni-website/prompts/IMAGE-PROMPTS.txt`
2. **Generate videos** using prompts in `/apps/website/ferni-website/prompts/VEO3-PROMPTS.txt`
3. **Export brand book** by printing `/brand/brand-book.html` to PDF

---

## 3. Development Environment

### Prerequisites

```bash
# Node.js 20+
node --version  # Should be v20.x

# Google Cloud CLI
gcloud --version

# pnpm or npm
npm --version
```

### Initial Setup

```bash
# Clone the repository
git clone <repo-url>
cd voiceai

# Install dependencies
npm install

# Install frontend dependencies
cd apps/web && npm install && cd ..

# Copy environment template
cp .env.example .env
# Edit .env with your API keys
```

### Environment Variables

```bash
# Required
GOOGLE_API_KEY=your_google_ai_key
CARTESIA_API_KEY=your_cartesia_key
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your_livekit_key
LIVEKIT_API_SECRET=your_livekit_secret

# Optional
GOOGLE_CLOUD_PROJECT=your_gcp_project
FIREBASE_PROJECT_ID=your_firebase_project
```

### Local Development

```bash
# Terminal 1: Run voice agent locally
npm run dev

# Terminal 2: Run frontend app
cd apps/web && npm run dev

# Terminal 3: Run landing page (for testing)
cd apps/website/ferni-website && python3 -m http.server 8765
```

---

## 4. Landing Page (Marketing Site)

### Location
`/apps/website/ferni-website/`

### Structure

```
ferni-website/
├── index.html          # Main HTML
├── css/styles.css      # Styled per brand guidelines
├── js/main.js          # Interactions, GSAP animations
├── images/             # Static images
│   └── sequence/       # Scroll animation frames
└── prompts/            # AI asset generation prompts
    ├── IMAGE-PROMPTS.txt
    ├── VEO3-PROMPTS.txt
    └── MOVIE-STORY-PROMPTS.txt
```

### Key Features
- Hero with scroll animation (GSAP + Canvas)
- Glassmorphism navigation
- Team persona cards
- FAQ accordion
- Newsletter signup

### Local Testing

```bash
cd apps/website/ferni-website
python3 -m http.server 8765
# Open http://localhost:8765
```

### Deployment Options

**Option A: Firebase Hosting (Recommended for landing page)**

```bash
cd apps/website/ferni-website
firebase init hosting
firebase deploy
```

**Option B: Netlify / Vercel (Static hosting)**

Connect repo and set root to `/apps/website/ferni-website`

**Option C: GCP Cloud Storage + CDN**

```bash
# Create bucket
gsutil mb -l us-central1 gs://ferni-landing

# Upload files
gsutil -m cp -r apps/website/ferni-website/* gs://ferni-landing/

# Make public
gsutil iam ch allUsers:objectViewer gs://ferni-landing

# Enable website
gsutil web set -m index.html gs://ferni-landing
```

---

## 5. Frontend App

### Location
`/apps/web/`

### Technology Stack
- Vite + TypeScript
- LiveKit WebRTC
- Vanilla TypeScript (no framework)

### Structure

```
apps/web/
├── src/
│   ├── main.ts           # Entry point
│   ├── config/
│   │   └── personas.ts   # Persona configurations
│   ├── services/
│   │   └── livekit.ts    # WebRTC connection
│   └── components/
│       └── ...
├── public/
│   └── design-system/
│       └── tokens.css    # Design tokens
├── index.html
└── vite.config.ts
```

### Development

```bash
cd apps/web
npm install
npm run dev
# Open http://localhost:5173
```

### Building

```bash
npm run build
# Output in dist/
```

### Deployment (Cloud Run)

Uses `Dockerfile.ui` and `cloudbuild-ui.yaml`:

```bash
./scripts/deploy-ui.sh
```

---

## 6. Backend AI Agent

### Location
`/src/`

### Core Files

```
src/
├── agent.ts              # Main entry point
├── personas/
│   ├── bundles/          # Persona definitions (JSON + MD)
│   │   ├── ferni/
│   │   ├── jack-bogle/
│   │   ├── peter-lynch/
│   │   ├── alex-chen/
│   │   ├── maya-santos/
│   │   └── jordan-taylor/
│   └── persona-loader.ts
├── intelligence/
│   └── ...               # AI logic
├── services/
│   ├── firestore.ts      # Memory storage
│   └── cartesia.ts       # Text-to-speech
└── conversation/
    └── ...               # Conversation flow
```

### Running Locally

```bash
# Build TypeScript
npm run build

# Run agent
npm run start

# Or development mode
npm run dev
```

### Deployment

```bash
./scripts/deploy-gcp.sh
```

---

## 7. Google Cloud Setup

### One-Time Setup

```bash
# 1. Set project
export GCP_PROJECT_ID="your-project-id"
gcloud config set project $GCP_PROJECT_ID

# 2. Enable required APIs
gcloud services enable \
  cloudbuild.googleapis.com \
  run.googleapis.com \
  firestore.googleapis.com \
  secretmanager.googleapis.com \
  containerregistry.googleapis.com

# 3. Create Firestore database
gcloud firestore databases create \
  --location=us-central1 \
  --type=firestore-native

# 4. Create secrets
./scripts/upload-secrets-gcp.sh
# OR manually:
echo -n "YOUR_VALUE" | gcloud secrets create secret-name --data-file=-
```

### Required Secrets

| Secret Name | Description |
|-------------|-------------|
| `google-api-key` | Google AI Studio API key |
| `cartesia-api-key` | Cartesia TTS API key |
| `livekit-url` | LiveKit WebSocket URL |
| `livekit-api-key` | LiveKit API key |
| `livekit-api-secret` | LiveKit API secret |

### Optional Secrets

| Secret Name | Description |
|-------------|-------------|
| `redis-url` | Redis for caching (requires VPC) |
| `alpha-vantage-key` | Stock data API |
| `spotify-client-id` | Spotify integration |
| `spotify-client-secret` | Spotify integration |

### Service Account Permissions

The Cloud Run service account needs:
- `roles/secretmanager.secretAccessor`
- `roles/datastore.user` (for Firestore)

```bash
PROJECT_NUMBER=$(gcloud projects describe $GCP_PROJECT_ID --format='value(projectNumber)')

for SECRET in google-api-key cartesia-api-key livekit-url livekit-api-key livekit-api-secret; do
  gcloud secrets add-iam-policy-binding $SECRET \
    --member="serviceAccount:$PROJECT_NUMBER-compute@developer.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"
done
```

---

## 8. Deployment Workflows

### Deploy Everything

```bash
# 1. Deploy voice agent
./scripts/deploy-gcp.sh

# 2. Deploy frontend app
./scripts/deploy-ui.sh

# 3. Deploy landing page (choose one)
firebase deploy                    # Firebase Hosting
# OR
gsutil -m cp -r apps/website/ferni-website/* gs://ferni-landing/
```

### Individual Deployments

**Voice Agent Only:**
```bash
./scripts/deploy-gcp.sh
```

**Frontend App Only:**
```bash
./scripts/deploy-ui.sh
```

**Landing Page Only:**
```bash
cd apps/website/ferni-website
firebase deploy
```

### Deployment Checklist

```markdown
□ Brand assets updated in /brand/
□ Landing page tested locally
□ Frontend app builds successfully
□ All secrets configured in GCP
□ Environment variables set
□ Firestore indexes deployed
□ LiveKit agent URL configured
```

---

## 9. CI/CD Automation

### Cloud Build Triggers

Set up in Google Cloud Console → Cloud Build → Triggers:

**Agent Deployment (main branch)**
```yaml
# cloudbuild.yaml is used automatically
Trigger: Push to main
Config: cloudbuild.yaml
```

**UI Deployment (main branch)**
```yaml
# Manual trigger or separate branch
Trigger: Push to ui-deploy branch
Config: cloudbuild-ui.yaml
```

### GitHub Actions (Alternative)

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to GCP

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
      
      - name: Deploy Agent
        run: ./scripts/deploy-gcp.sh

  deploy-ui:
    runs-on: ubuntu-latest
    needs: deploy-agent
    steps:
      - uses: actions/checkout@v4
      
      - uses: google-github-actions/auth@v2
        with:
          credentials_json: ${{ secrets.GCP_SA_KEY }}
      
      - uses: google-github-actions/setup-gcloud@v2
      
      - name: Deploy UI
        run: ./scripts/deploy-ui.sh
```

---

## 10. Monitoring & Maintenance

### Viewing Logs

```bash
# Agent logs
gcloud run services logs read voiceai-agent \
  --region us-central1 \
  --limit 100

# UI logs
gcloud run services logs read john-bogle-ui \
  --region us-central1 \
  --limit 100
```

### Health Checks

```bash
# Check agent status
curl https://voiceai-agent-xxxxx.a.run.app/health

# Check UI status
curl https://john-bogle-ui-xxxxx.a.run.app/
```

### Updating Services

```bash
# Quick redeploy (same image)
gcloud run services update voiceai-agent --region us-central1

# Full rebuild and deploy
./scripts/deploy-gcp.sh
```

### Rollback

```bash
# List revisions
gcloud run revisions list --service voiceai-agent --region us-central1

# Rollback to previous
gcloud run services update-traffic voiceai-agent \
  --to-revisions=voiceai-agent-xxxxx=100 \
  --region us-central1
```

### Cost Management

- Cloud Run scales to zero when idle
- Set max instances to control costs
- Monitor in GCP Console → Billing

---

## 11. Quick Reference

### URLs

| Service | URL |
|---------|-----|
| Landing Page | https://ferni.ai |
| Web App | https://app.ferni.ai |
| Phone | 1 (484) 481-3081 |

### Commands Cheat Sheet

```bash
# Local development
npm run dev                      # Run agent
cd apps/web && npm run dev  # Run frontend

# Build
npm run build                    # Build agent
cd apps/web && npm run build  # Build frontend

# Deploy
./scripts/deploy-gcp.sh          # Deploy agent
./scripts/deploy-ui.sh           # Deploy UI

# Logs
gcloud run services logs read voiceai-agent --region us-central1

# Secrets
gcloud secrets list
gcloud secrets versions access latest --secret=secret-name
```

### File Locations

| Asset | Path |
|-------|------|
| Brand Guidelines | `/design-system/brand/FERNI-SCREEN-GUIDELINES.md` |
| Design Tokens | `/brand/ferni-design-tokens.css` |
| Landing Page | `/apps/website/ferni-website/` |
| Frontend App | `/apps/web/` |
| Voice Agent | `/src/` |
| Personas | `/src/personas/bundles/` |
| Deploy Scripts | `/scripts/` |

### Environment Files

| File | Purpose |
|------|---------|
| `.env` | Local development secrets |
| `.env.example` | Template |
| `firestore.indexes.json` | Firestore index definitions |
| `livekit.toml` | LiveKit local config |

---

## Appendix: Troubleshooting

### "Agent not connecting to LiveKit"
1. Check LIVEKIT_URL starts with `wss://`
2. Verify API key/secret are correct
3. Check Cloud Run logs for errors

### "Voice not working"
1. Verify Cartesia API key is valid
2. Check voice ID exists in Cartesia account
3. Test locally first

### "Firestore permission denied"
1. Check service account has `roles/datastore.user`
2. Verify GOOGLE_CLOUD_PROJECT is set
3. Ensure Firestore database exists

### "Build fails"
1. Check Node version is 20+
2. Clear npm cache: `npm cache clean --force`
3. Delete node_modules and reinstall

---

**© 2024 Ferni. All rights reserved.**

