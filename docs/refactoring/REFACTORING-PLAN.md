# Server Code Refactoring Plan

> A comprehensive plan to improve naming consistency, code organization, and maintainability.

## Executive Summary

| Issue | Count | Priority |
|-------|-------|----------|
| Handler/Routes naming inconsistency | 8 files | High |
| Monolithic server files | 2 files (1844 lines) | High |
| Services directory bloat | 165+ root-level files | Medium |
| Scattered feature code | 6+ locations per feature | Medium |
| Duplicate/orphan services | ~10 files | Low |

---

## Phase 1: Naming Standardization (1-2 days)

### 1.1 Rename Handler Files to Routes

All API handlers should use the `-routes.ts` suffix consistently.

```bash
# Execute these renames
git mv src/api/custom-agent-handler.ts src/api/custom-agent.routes.ts
git mv src/api/evalops-handler.ts src/api/evalops.routes.ts
git mv src/api/landing-intelligence-handler.ts src/api/landing-intelligence.routes.ts
git mv src/api/landing-optimization-handler.ts src/api/landing-optimization.routes.ts
git mv src/api/outreach-handler.ts src/api/outreach.routes.ts
git mv src/api/scheduled-jobs-handler.ts src/api/scheduled-jobs.routes.ts
git mv src/api/voice-auth-handler.ts src/api/voice-auth.routes.ts
git mv src/api/wellbeing-handler.ts src/api/wellbeing.routes.ts
```

### 1.2 Update Imports After Rename

Files that import from renamed handlers (update in `src/servers/api/index.ts`):

```typescript
// BEFORE
import { handleEvalOpsRoutes } from '../../api/evalops-handler.js';
import { handleOutreachRoutes } from '../../api/outreach-handler.js';
import { handleVoiceAuthRoutes } from '../../api/voice-auth-handler.js';
import { handleWellbeingRoutes } from '../../api/wellbeing-handler.js';
import { handleScheduledJobsRoutes } from '../../api/scheduled-jobs-handler.js';
import { handleLandingIntelligenceRoutes } from '../../api/landing-intelligence-handler.js';
import { handleLandingOptimizationRoutes } from '../../api/landing-optimization-handler.js';
import { handleCustomAgentRoutes } from '../../api/custom-agent-handler.js';

// AFTER
import { handleEvalOpsRoutes } from '../../api/evalops.routes.js';
import { handleOutreachRoutes } from '../../api/outreach.routes.js';
import { handleVoiceAuthRoutes } from '../../api/voice-auth.routes.js';
import { handleWellbeingRoutes } from '../../api/wellbeing.routes.js';
import { handleScheduledJobsRoutes } from '../../api/scheduled-jobs.routes.js';
import { handleLandingIntelligenceRoutes } from '../../api/landing-intelligence.routes.js';
import { handleLandingOptimizationRoutes } from '../../api/landing-optimization.routes.js';
import { handleCustomAgentRoutes } from '../../api/custom-agent.routes.js';
```

### 1.3 Establish Naming Convention

Add to CLAUDE.md:

```markdown
## File Naming Conventions

| Layer | Suffix | Example |
|-------|--------|---------|
| API Routes | `.routes.ts` | `calendar.routes.ts` |
| Services | `.service.ts` | `calendar.service.ts` |
| Repositories | `.repository.ts` | `calendar.repository.ts` |
| Types | `.types.ts` | `calendar.types.ts` |
| Utilities | `.utils.ts` | `date.utils.ts` |
| Jobs | `.job.ts` | `sync-calendar.job.ts` |
| Workers | `.worker.ts` | `notification.worker.ts` |
```

---

## Phase 2: Route Registry Implementation (1 day)

### 2.1 Create Route Registry

Replace 70+ sequential if-statements with a declarative registry.

**New file: `src/servers/api/route-registry.ts`**

See the generated `route-registry.ts` file for implementation.

### 2.2 Refactor Server to Use Registry

**Modify: `src/servers/api/index.ts`**

```typescript
// BEFORE: 70+ if statements
if (pathname.startsWith('/api/calendar')) {
  if (await handleCalendarRoutes(req, res, pathname)) return;
}
if (pathname.startsWith('/api/habits')) {
  if (await handleHabitRoutes(req, res, pathname)) return;
}
// ... 68 more

// AFTER: Single loop
import { matchRoute, routes } from './route-registry.js';

const route = matchRoute(pathname);
if (route) {
  if (await route.handler(req, res, pathname)) return;
}
```

---

## Phase 3: Server File Decomposition (2-3 days)

### 3.1 Split UI Server (931 lines → ~300 lines)

**Current: `src/servers/api/index.ts` (931 lines)**

Split into:

```
src/servers/api/
├── index.ts              (~150 lines) - Server setup, middleware chain
├── route-registry.ts     (~200 lines) - Route definitions
├── middleware/
│   ├── cors.ts           (existing, move from shared/)
│   ├── rate-limit.ts     (~50 lines) - Rate limiting setup
│   ├── auth.ts           (~50 lines) - Auth middleware
│   └── error-handler.ts  (~50 lines) - Error handling
├── routes/
│   └── index.ts          (existing, re-export all route handlers)
└── health.ts             (~30 lines) - Health check endpoints
```

### 3.2 Split Token Server (913 lines → ~200 lines)

**Current: `src/servers/token/index.ts` (913 lines)**

Split into:

```
src/servers/token/
├── index.ts              (~100 lines) - Server setup
├── route-registry.ts     (~100 lines) - Token routes
├── middleware/
│   └── rate-limit.ts     - Demo rate limiting
├── livekit.ts            (existing)
├── demo-rate-limit.ts    (existing)
├── validation.ts         (existing)
└── oauth/
    ├── spotify.ts        (existing)
    ├── google-calendar.ts (existing)
    └── wearables.ts      (existing)
```

---

## Phase 4: Services Directory Reorganization (3-5 days)

### 4.1 Delete Confirmed Duplicates/Orphans

```bash
# Confirmed duplicate (old implementation)
rm src/services/engagement-notifications.ts

# Review these for deletion (appear unused):
# - src/services/learned-memories.ts
# - src/services/optimization-api.ts
# - src/services/spontaneous-sharing.ts
# - src/services/seed-economy.ts
```

### 4.2 Group Root-Level Services into Directories

Move 165+ root-level files into logical directories:

```
src/services/
├── memory/                    # Memory-related services
│   ├── cognitive-memory.ts
│   ├── cognitive-persistence.ts
│   ├── realtime-memory.ts
│   ├── voice-memory.ts
│   ├── voice-conversation-memory.ts
│   ├── human-listening-memory.ts
│   ├── collective-learning-store.ts
│   ├── memory-management.ts
│   ├── memory-monitor.ts
│   └── persona-memories.ts
│
├── voice/                     # Voice-related services
│   ├── voice-identification.ts
│   ├── voice-enrollment.ts
│   ├── voice-antispoofing.ts
│   ├── voice-liveness.ts
│   ├── voice-profile-store.ts
│   ├── voice-audit-log.ts
│   ├── voice-speaker-change.ts
│   ├── voice-call.ts
│   ├── voice-adaptation.ts
│   ├── voice-household.ts
│   ├── voice-humanization-metrics.ts
│   ├── voice-presence-analytics.ts
│   ├── voice-rate-limit.ts
│   └── dynamic-voice-parameters.ts
│
├── identity/                  # Identity & auth services
│   ├── user-identification.ts
│   ├── natural-auth.ts
│   ├── firebase-auth.ts
│   ├── spotify-auth.ts
│   ├── google-calendar-oauth.ts
│   └── geo-detection.ts
│
├── engagement/                # Engagement services
│   ├── engagement-notification-service.ts
│   ├── engagement-store.ts
│   ├── engagement-conversation-triggers.ts
│   ├── gamification-store.ts
│   └── team-engagement.ts
│
├── scheduling/                # Scheduling services
│   ├── reminder-scheduler.ts
│   ├── proactive-scheduler.ts
│   ├── calendar-reminders.ts
│   ├── calendar-busy-detection.ts
│   ├── appointment-integration.ts
│   ├── appointment-followup.ts
│   └── background-tasks.ts
│
├── personalization/           # Personalization services
│   ├── persona-modes.ts
│   ├── persona-behavior-manager.ts
│   ├── profile-personalizer.ts
│   ├── humanizing-state.ts
│   ├── mood-drift.ts
│   ├── emotion-detection.ts
│   └── cultural-awareness.ts
│
├── deployment/                # Deployment & ops services
│   ├── auto-rollback.ts
│   ├── canary-deployment.ts
│   ├── post-deploy-verification.ts
│   ├── container-watchdog.ts
│   ├── health-checks.ts
│   ├── startup-validation.ts
│   └── shutdown.ts
│
├── analytics/                 # Analytics services
│   ├── user-analytics.ts
│   ├── tool-usage-analytics.ts
│   ├── humanization-analytics.ts
│   ├── outreach-analytics.ts
│   ├── call-quality-monitor.ts
│   └── dora-metrics.ts
│
├── stores/                    # Data stores
│   ├── productivity-store.ts
│   ├── life-data-store.ts
│   ├── financial-store.ts
│   └── session-cache.ts
│
└── external/                  # External integrations
    ├── external-apis.ts
    ├── google-places.ts
    ├── twilio-sms.ts
    ├── twilio-webhooks.ts
    ├── food-delivery.ts
    ├── restaurant-reservations.ts
    ├── yelp.ts
    └── itunes.ts
```

### 4.3 Update Import Paths

After moving files, create barrel exports in each new directory:

```typescript
// src/services/memory/index.ts
export * from './cognitive-memory.js';
export * from './realtime-memory.js';
export * from './voice-memory.js';
// ... etc
```

---

## Phase 5: Feature Colocation (Long-term)

### 5.1 Create Feature Directories

For major features, colocate all related code:

```
src/features/
├── calendar/
│   ├── calendar.routes.ts        # HTTP endpoints
│   ├── calendar.service.ts       # Business logic
│   ├── calendar.repository.ts    # Data access
│   ├── calendar.types.ts         # Types
│   ├── polling/                  # Sub-feature
│   ├── webhooks/                 # Sub-feature
│   └── jobs/                     # Scheduled jobs
│       └── sync-calendar.job.ts
│
├── habits/
│   ├── habits.routes.ts
│   ├── habits.service.ts
│   ├── habits.repository.ts
│   ├── habits.types.ts
│   └── templates/
│       └── habit-templates.ts
│
└── voice-auth/
    ├── voice-auth.routes.ts
    ├── voice-auth.service.ts
    ├── enrollment/
    ├── verification/
    └── household/
```

### 5.2 Migration Strategy

1. Start with ONE feature (e.g., `calendar`)
2. Create the feature directory structure
3. Move files one at a time, updating imports
4. Update barrel exports for backward compatibility
5. Run `pnpm typecheck` after each move
6. Repeat for next feature

---

## Validation Checklist

After each phase:

- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm test` passes
- [ ] `pnpm quality:arch` passes (no layer violations)
- [ ] All three servers start successfully
- [ ] Smoke test key API endpoints

---

## Priority Order

| Phase | Effort | Impact | Priority |
|-------|--------|--------|----------|
| 1. Naming Standardization | Low | High | Do First |
| 2. Route Registry | Medium | High | Do Second |
| 3. Server Decomposition | Medium | Medium | Do Third |
| 4. Services Reorganization | High | Medium | Do Fourth |
| 5. Feature Colocation | Very High | High | Long-term |

---

## Quick Wins (Do Today)

1. **Rename the 8 handler files** to use `.routes.ts`
2. **Delete `engagement-notifications.ts`** (confirmed duplicate)
3. **Create `route-registry.ts`** (reduces server complexity immediately)
