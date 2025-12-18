# 🚀 AI-Powered Landing Page Rollout Plan

## Overview

10 new AI-powered features for the landing page, designed to demonstrate Ferni's "Better than Human" capabilities before visitors even sign up.

---

## Pre-Deployment Checklist ✅

- [x] Backend API endpoints created (`/api/landing/ai/*`)
- [x] Frontend JS with feature flag integration
- [x] Firebase rewrites configured for landing page
- [x] TypeScript compilation passing
- [x] Feature flags added (all disabled by default)
- [x] Voice samples CSS added
- [x] Design system tokens created
- [x] Storybook stories created
- [ ] Voice sample audio files generated (see `apps/website/ferni-website/src/audio/README.md`)
- [ ] E2E tests written

---

## Feature Summary

| Feature | Impact | Risk | Phase |
|---------|--------|------|-------|
| **Live Chat Widget** | High | Medium | 2 |
| **Persona Preview Cards** | Medium | Low | 1 |
| **Smart FAQ** | High | Low | 1 |
| **Personalized Hero** | High | Medium | 2 |
| **Dynamic Social Proof** | Medium | Low | 1 |
| **Hover Previews** | Low | Low | 1 |
| **Voice Samples** | High | Low | 1 |
| **Micro Expressions** | Medium | Low | 1 |
| **Memory Demo** | High | Low | 1 |
| **Sentiment-Reactive Copy** | Medium | Medium | 3 |

---

## Phase 1: Low-Risk, High-Visibility (Week 1)

### Features to Enable

| Feature | Flag | Percentage |
|---------|------|------------|
| Voice Samples | `landing-ai-voice-samples` | 100% |
| Memory Demo | `landing-ai-memory-demo` | 100% |
| Micro Expressions | `landing-ai-micro-expressions` | 100% |
| Hover Previews | `landing-ai-hover-previews` | 50% |
| Social Proof | `landing-ai-social-proof` | 50% |
| Smart FAQ | `landing-ai-smart-faq` | 25% |
| Persona Previews | `landing-ai-persona-previews` | 25% |

### Deployment Steps

```bash
# 1. Deploy backend first (has new API endpoints)
npm run deploy:ui:async

# 2. Monitor for errors (5 min)
tail -f .deploy-logs/*.log
gcloud logging read "resource.type=cloud_run_revision AND severity>=ERROR" --limit=20

# 3. Deploy landing page
npm run deploy:landing

# 4. Enable flags gradually (via admin panel or direct JSON edit)
```

### Success Metrics (Phase 1)

- [ ] No increase in page load time (< 200ms delta)
- [ ] No console errors from new features
- [ ] Click-through rate on voice samples > 5%
- [ ] Memory demo engagement > 10% of visitors
- [ ] No increase in bounce rate

---

## Phase 2: AI-Heavy Features (Week 2)

### Features to Enable

| Feature | Flag | Percentage |
|---------|------|------------|
| Live Chat Widget | `landing-ai-live-chat` | 10% → 50% → 100% |
| Personalized Hero | `landing-ai-personalized-hero` | 25% → 50% → 100% |

### Prerequisites

- [ ] Phase 1 running stable for 3+ days
- [ ] Gemini API rate limits verified
- [ ] Rate limiting on chat (10 msg/session) tested
- [ ] Fallback content for API failures tested

### Deployment Steps

```bash
# 1. Enable at 10% first
# Edit feature-flags.json: landing-ai-live-chat.percentage = 10

# 2. Monitor for 24 hours
# - API error rate
# - Chat message success rate
# - Conversion funnel impact

# 3. Ramp to 50% if stable
# 4. Ramp to 100% after 48 hours stable
```

### Success Metrics (Phase 2)

- [ ] Chat widget: 5+ messages average per session
- [ ] Chat → signup conversion > 15%
- [ ] Personalized hero: CTR improvement > 10%
- [ ] API latency p95 < 500ms
- [ ] Error rate < 0.5%

---

## Phase 3: Advanced Features (Week 3)

### Features to Enable

| Feature | Flag | Percentage |
|---------|------|------------|
| Sentiment-Reactive Copy | `landing-ai-sentiment-copy` | 25% → 50% |

### Prerequisites

- [ ] Phase 2 running stable for 5+ days
- [ ] Sentiment detection accuracy validated
- [ ] A/B test framework capturing conversion data

### Success Metrics (Phase 3)

- [ ] Sentiment detection accuracy > 80%
- [ ] Copy adaptation feels natural (user feedback)
- [ ] No negative impact on conversion

---

## Rollback Plan

### If Issues Detected

1. **Quick Disable**: Set feature flag percentage to 0%
   ```json
   { "id": "landing-ai-live-chat", "percentage": 0 }
   ```

2. **Full Rollback**: Disable entire category
   ```json
   { "id": "landing-intelligence", "enabled": false }
   ```

3. **Emergency**: Revert landing page to previous version
   ```bash
   # Find previous successful deploy
   firebase hosting:channel:list --site ferni-landing
   
   # Rollback
   firebase hosting:clone ferni-landing:<previous-version> ferni-landing:live
   ```

### Error Thresholds

| Metric | Yellow | Red |
|--------|--------|-----|
| API Error Rate | > 1% | > 5% |
| Page Load Time | > 500ms delta | > 1s delta |
| Bounce Rate | > 5% increase | > 10% increase |
| Console Errors | > 10/hour | > 100/hour |

---

## Monitoring Checklist

### Before Launch

- [ ] Backend APIs deployed and health-checked
- [ ] Feature flags configured (all at 0%)
- [ ] Sentry monitoring enabled for landing page
- [ ] Google Analytics events set up
- [ ] Fallback content tested (API offline scenario)

### Daily During Rollout

- [ ] Check Sentry for new errors
- [ ] Review API latency metrics
- [ ] Check conversion funnel in GA
- [ ] Review chat transcript samples (quality)
- [ ] Monitor Gemini API usage/costs

### Weekly Review

- [ ] A/B test results analysis
- [ ] User feedback review
- [ ] Cost analysis (API calls)
- [ ] Performance audit
- [ ] Plan next phase

---

## Cost Estimates

### API Costs (Gemini 1.5 Flash)

| Feature | Est. Calls/Day | Est. Cost/Day |
|---------|----------------|---------------|
| Live Chat | 500 | ~$0.50 |
| Smart FAQ | 200 | ~$0.20 |
| Personalized Hero | 1000 | ~$0.30 |
| Hover Previews | 300 | ~$0.15 |
| Social Proof | 100 | ~$0.05 |
| Sentiment Copy | 500 | ~$0.25 |
| **Total** | **2600** | **~$1.45/day** |

*Based on Gemini 1.5 Flash pricing: ~$0.00025/1k tokens*

---

## Commands Reference

### Deploy

```bash
# Backend (required first)
npm run deploy:ui:async

# Landing page
npm run deploy:landing

# Both
npm run deploy:ui:async && sleep 120 && npm run deploy:landing
```

### Monitor

```bash
# Backend logs
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=bogle-ui" --limit=50

# Landing errors
gcloud logging read "resource.type=cloud_run_revision AND severity>=ERROR" --limit=20

# Check feature flag usage
curl https://app.ferni.ai/api/v1/public/experiments/stats
```

### Feature Flag Management

```bash
# View current flags
cat data/feature-flags.json | jq '.[] | select(.category == "landing-ai")'

# Enable feature at X%
# Edit data/feature-flags.json, then:
npm run deploy:ui:async
```

---

## Team Checklist

### Before Go-Live

- [ ] @seth - Backend API review
- [ ] @seth - Frontend integration review
- [ ] @seth - Brand/copy review
- [ ] @seth - Performance baseline captured

### Go-Live Day

- [ ] Deploy backend (morning)
- [ ] Deploy landing page
- [ ] Enable Phase 1 flags
- [ ] Monitor for 4 hours
- [ ] Go/No-Go decision for overnight

---

## Questions?

Contact: Seth (@seth in Slack)

Last Updated: December 13, 2024

