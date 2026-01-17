# 📊 Dashboard Sprint Plan

> **Created:** December 15, 2024  
> **Status:** Active  
> **Goal:** Complete all dashboard alignment to design system and deploy to production

---

## ✅ COMPLETED (December 15, 2024)

### Phase 0: Foundation (Same Day)

| Task | Status | Notes |
|------|--------|-------|
| HTML Dashboards Design System | ✅ DONE | All 19 dashboards use `tokens.css` |
| Skip Links (WCAG AA) | ✅ DONE | 19/19 dashboards |
| Reduced Motion Support | ✅ DONE | 19/19 dashboards |
| Tools Dashboard API Fix | ✅ DONE | Added auth headers + data source indicator |
| Business Metrics Backend | ✅ DONE | `/api/analytics/summary` + Firestore persistence |
| Deploy to Production | ✅ DONE | CI/CD triggered on push to main |

---

## 📋 Remaining Work (P1/P2 Admin Portal Sections)

### Sprint 1: Core Business Visibility (Week 1)

**Goal:** Get real-time business metrics working in admin portal

| Task | Priority | Estimate | Owner |
|------|----------|----------|-------|
| Connect BusinessMetricsSection to `/api/analytics/summary` | P1 | 2h | - |
| Add Stripe subscription metrics endpoint | P1 | 4h | - |
| Dashboard (Main) - Persist activity log to Firestore | P1 | 3h | - |
| EvalOps - Migrate from in-memory to Firestore | P1 | 4h | - |

**Acceptance Criteria:**
- [ ] Business Metrics shows real DAU/WAU/MAU
- [ ] Subscription metrics (MRR, churn) display correctly
- [ ] Activity log survives server restarts
- [ ] EvalOps evaluations persist across deployments

---

### Sprint 2: Operational Visibility (Week 2)

**Goal:** Real-time ops metrics for incident response

| Task | Priority | Estimate | Owner |
|------|----------|----------|-------|
| Human Listening - Add session recording controls | P1 | 6h | - |
| Operations Section - Real Cloud Run metrics | P1 | 4h | - |
| Builder Metrics - Track context builder execution | P1 | 4h | - |
| Connection Dashboard - Verify API connectivity | P2 | 2h | - |

**Acceptance Criteria:**
- [ ] Human Listening shows live sessions with privacy controls
- [ ] Operations shows CPU, memory, error rates from Cloud Run
- [ ] Builder metrics show execution times and injection counts

---

### Sprint 3: Polish & Historical Data (Week 3)

**Goal:** Historical trends and polish

| Task | Priority | Estimate | Owner |
|------|----------|----------|-------|
| Agents Section - Historical performance data | P2 | 4h | - |
| Trust Section - User trust score history | P2 | 3h | - |
| Experiments Section - Statistical significance | P2 | 4h | - |
| Diagnostics Section - Comprehensive health checks | P2 | 3h | - |

**Acceptance Criteria:**
- [ ] Agent performance trends over 7/30 days
- [ ] Trust score graphs per user
- [ ] A/B test results with confidence intervals

---

### Sprint 4: API & Documentation (Week 4)

**Goal:** Complete API docs and verify all dashboards

| Task | Priority | Estimate | Owner |
|------|----------|----------|-------|
| API Docs Section - Interactive explorer | P2 | 6h | - |
| Avatar Soul Section - Performance metrics | P2 | 3h | - |
| More Dashboards Hub - Status indicators | P2 | 2h | - |
| Full E2E dashboard testing | P2 | 4h | - |

**Acceptance Criteria:**
- [ ] All API endpoints documented with examples
- [ ] Avatar expression timing visualizer
- [ ] All dashboard links verified working
- [ ] E2E tests for critical dashboards

---

## 📊 Dashboard Status Matrix

### HTML Dashboards (19 total) - ALL PRODUCTION READY ✅

| Dashboard | tokens.css | Skip Link | Reduced Motion | Real API |
|-----------|------------|-----------|----------------|----------|
| analytics-dashboard | ✅ | ✅ | ✅ | ✅ |
| metrics-dashboard | ✅ | ✅ | ✅ | ✅ |
| error-dashboard | ✅ | ✅ | ✅ | ✅ |
| persona-dashboard | ✅ | ✅ | ✅ | ✅ |
| ux-dashboard | ✅ | ✅ | ✅ | ✅ |
| llm-dashboard | ✅ | ✅ | ✅ | ✅ |
| cost-dashboard | ✅ | ✅ | ✅ | ✅ |
| handoff-dashboard | ✅ | ✅ | ✅ | ✅ |
| tools-dashboard | ✅ | ✅ | ✅ | ✅ (fixed) |
| cameo-dashboard | ✅ | ✅ | ✅ | ✅ |
| cognitive-dashboard | ✅ | ✅ | ✅ | ✅ |
| memory-dashboard | ✅ | ✅ | ✅ | ✅ |
| connection-dashboard | ✅ | ✅ | ✅ | ⚠️ verify |
| voice-humanization-dashboard | ✅ | ✅ | ✅ | ✅ |
| voice-presence-dashboard | ✅ | ✅ | ✅ | ✅ |
| outreach-dashboard | ✅ | ✅ | ✅ | ⚠️ verify |
| experiments-dashboard | ✅ | ✅ | ✅ | ✅ |
| dora-dashboard | ✅ | ✅ | ✅ | ⚠️ verify |
| observability-hub | ✅ | ✅ | ✅ | ✅ |

### Admin Portal Sections (15 total)

| Section | Status | Backend | Frontend | Tests |
|---------|--------|---------|----------|-------|
| Dashboard (Main) | ⚠️ P1 | ✅ | ✅ | ⬜ |
| Business Metrics | ⚠️ P1 | ✅ | ✅ | ⬜ |
| Agents | ✅ | ✅ | ✅ | ⬜ |
| EvalOps | ⚠️ P1 | ⚠️ in-memory | ✅ | ⬜ |
| Trust | ✅ | ✅ | ✅ | ⬜ |
| Human Listening | ⚠️ P1 | ⚠️ partial | ✅ | ⬜ |
| Speech Metrics | ✅ | ✅ | ✅ | ⬜ |
| Experiments | ✅ | ✅ | ✅ | ⬜ |
| Feature Flags | ✅ DONE | ✅ | ✅ | ✅ |
| Operations | ⚠️ P1 | ⚠️ partial | ✅ | ⬜ |
| Builder Metrics | ⚠️ P1 | ⚠️ partial | ✅ | ⬜ |
| Diagnostics | ⚠️ P2 | ⚠️ partial | ✅ | ⬜ |
| API Docs | ⚠️ P2 | ⚠️ partial | ✅ | ⬜ |
| Avatar Soul | ✅ | ✅ | ✅ | ⬜ |
| Design System | ✅ DONE | ✅ | ✅ | ✅ |
| More Dashboards | ✅ | N/A | ✅ | ⬜ |

---

## 🔗 Key API Endpoints

### Working APIs (Production Ready)

| Endpoint | Dashboard | Status |
|----------|-----------|--------|
| `/api/analytics/summary` | Business Metrics | ✅ |
| `/api/analytics/concurrent` | Business Metrics | ✅ |
| `/api/metrics/summary` | Metrics Dashboard | ✅ |
| `/api/observability/*` | All Observability | ✅ |
| `/api/tools/analytics` | Tools Dashboard | ✅ |
| `/api/cognitive/state` | Cognitive Dashboard | ✅ |
| `/api/diagnostics/handoffs/*` | Handoff Dashboard | ✅ |
| `/api/v1/admin/dashboard/*` | Admin Dashboard | ✅ |
| `/api/v1/admin/flags` | Feature Flags | ✅ |

### APIs Needing Work

| Endpoint | Needed For | Status |
|----------|------------|--------|
| `/api/subscription/metrics` | Business Metrics | ⚠️ needs Stripe integration |
| `/api/evalops/*` | EvalOps Section | ⚠️ needs Firestore migration |
| `/api/human-listening/*` | Human Listening | ⚠️ needs privacy controls |
| `/api/operations/*` | Operations Section | ⚠️ needs Cloud Run metrics |

---

## 📦 Deployment Pipeline

All dashboards deploy via CI/CD on push to `main`:

```bash
# Manual deployment (if needed)
ferni deploy ui        # Dashboard APIs → Cloud Run
ferni deploy frontend  # HTML Dashboards → Firebase Hosting

# Monitor progress
tail -f .deploy-logs/*.log
gcloud builds list --limit=3
```

### Deployment URLs

| Service | URL | Type |
|---------|-----|------|
| HTML Dashboards | https://app.ferni.ai/*.html | Firebase Hosting |
| Dashboard APIs | https://bogle-ui-*.run.app/api/* | Cloud Run |
| Admin Portal | https://app.ferni.ai/admin | Firebase + Cloud Run |

---

## ✅ Definition of Done

A dashboard is considered "done" when:

1. ✅ Uses `design-system/dist/tokens.css` for all styling
2. ✅ Has skip link for keyboard navigation
3. ✅ Implements `prefers-reduced-motion`
4. ✅ Connected to real API (not mock data)
5. ✅ Error states handled gracefully
6. ✅ Loading states shown
7. ✅ Theme toggle working
8. ✅ WCAG AA contrast ratios
9. ✅ Deployed to production
10. ⬜ E2E test coverage (stretch goal)

---

## 📚 References

- **Dashboard Audit:** `docs/audits/DASHBOARD-AUDIT.md`
- **Admin Implementation Plan:** `docs/plans/ADMIN-DASHBOARD-IMPLEMENTATION-PLAN.md`
- **Brand Guidelines:** `design-system/docs/brand/FERNI-BRAND-GUIDELINES.md`
- **Design Tokens:** `design-system/tokens/*.json`
- **Generated CSS:** `design-system/dist/tokens.css`

