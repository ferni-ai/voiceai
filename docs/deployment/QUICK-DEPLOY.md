# 🚀 Ferni Quick Deployment Guide

## Overview

Ferni has **4 deployment targets** that must be kept in sync:

| Target | What | URL | Deploy Command |
|--------|------|-----|----------------|
| **ferni-prod** | Main App | ferni-prod.web.app | `npm run deploy:app` |
| **johnb-app** | App (custom domain) | app.ferni.ai | `npm run deploy:app` |
| **ferni-landing** | Marketing Site | ferni-landing.web.app / ferni.ai | `npm run deploy:landing` |
| **bogle-ui** | Cloud Run Backend | (internal) | `npm run deploy:backend` |

## 🎯 Quick Deploy Commands

```bash
# Deploy EVERYTHING (recommended after major changes)
npm run deploy:all

# Deploy just the frontend app (both sites)
npm run deploy:app

# Deploy just the landing page
npm run deploy:landing

# Deploy just the Cloud Run backend
npm run deploy:backend
```

## When to Deploy What

### Changed Frontend Code (`apps/web/src/*`)
```bash
npm run deploy:app
```
This deploys to BOTH `ferni-prod` and `johnb-app` (app.ferni.ai).

### Changed Backend/API Code (`ui-server.js`, `src/*`)
```bash
npm run deploy:backend
```
This rebuilds and deploys the Cloud Run service.

### Changed Landing Page (`promo/ferni-website/*`)
```bash
npm run deploy:landing
```

### Changed Firebase Rewrites (`apps/web/firebase.json`)
```bash
npm run deploy:app
```
Rewrites are part of Firebase Hosting config.

### Changed Everything
```bash
npm run deploy:all
```

## 📁 File → Deployment Mapping

| Files Changed | Deploy Target |
|---------------|---------------|
| `apps/web/src/**` | `deploy:app` |
| `apps/web/firebase.json` | `deploy:app` |
| `apps/web/public/**` | `deploy:app` |
| `ui-server.js` | `deploy:backend` |
| `src/**/*.ts` | `deploy:backend` |
| `promo/ferni-website/**` | `deploy:landing` |
| `promo/ferni-website/_site/**` | `deploy:landing` |

## ⚠️ Common Mistakes

### 1. Forgetting to deploy to BOTH app sites
**Wrong:** Only deploying to `ferni-prod`
**Right:** Always deploy to both via `npm run deploy:app`

### 2. Adding API routes without updating rewrites
If you add a new API route (e.g., `/api/new-feature`), you need to:
1. Add the route to `ui-server.js`
2. Add the rewrite to `apps/web/firebase.json`
3. Deploy BOTH backend AND app

### 3. Forgetting to copy assets to `_site/` for landing page
The landing page uses `_site/` as the public folder. New assets must be copied there.

## 📝 Important Notes

### Google Analytics Errors
If you see `Fetch failed loading: POST "https://www.google-analytics.com/..."` errors in the console, **this is expected behavior** when users have ad blockers. GA will work for users without blockers. We've added graceful error handling so it logs a friendly message instead of an error.

### Landing Page Build
The landing page in `promo/ferni-website/_site/` is a built version. Always edit the source files in `promo/ferni-website/` (not `_site/`), then:
1. Build/copy files to `_site/`
2. Deploy with `npm run deploy:landing`

### Image Sequence for Landing Page
If updating the scroll animation, ensure images are in `promo/ferni-website/_site/images/sequence/`.

## 🔧 Setting Up Deploy Commands

Add these to your root `package.json`:

```json
{
  "scripts": {
    "deploy:app": "cd apps/web && firebase deploy --only hosting:ferni-prod,hosting:johnb-app --project johnb-2025",
    "deploy:landing": "cd promo/ferni-website && firebase deploy --only hosting:ferni-landing --project johnb-2025",
    "deploy:backend": "gcloud builds submit --config=cloudbuild-ui.yaml --project=johnb-2025",
    "deploy:all": "npm run deploy:app && npm run deploy:landing && npm run deploy:backend"
  }
}
```

## 🔍 Verifying Deployments

### Check API is working
```bash
curl https://app.ferni.ai/api/agents | head -50
curl https://app.ferni.ai/health
curl https://app.ferni.ai/spotify/status
```

### Check Firebase Hosting
```bash
firebase hosting:sites:list --project johnb-2025
```

### Check Cloud Run
```bash
gcloud run services list --project johnb-2025 --region us-central1
```

## 🚨 Rollback

### Firebase Hosting (frontend)
```bash
firebase hosting:clone SOURCE_SITE:SOURCE_VERSION TARGET_SITE --project johnb-2025
```
Or use Firebase Console → Hosting → Release History → Rollback

### Cloud Run (backend)
```bash
gcloud run services update-traffic bogle-ui --to-revisions=REVISION_NAME=100 --region=us-central1 --project=johnb-2025
```

## CI/CD (GitHub Actions)

Push to `main` automatically triggers:
- ✅ Build & Test
- ✅ Deploy Voice Agent to Cloud Run
- ✅ Deploy UI Server to Cloud Run

**Note:** Firebase Hosting is NOT auto-deployed. Run `npm run deploy:app` manually after merging.
