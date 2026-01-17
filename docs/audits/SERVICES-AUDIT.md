# Services Directory Audit

> Complete inventory of 240+ items in `src/services/` with categorization and recommendations.

## Executive Summary

| Metric | Count |
|--------|-------|
| Total items | 240 |
| Root-level files | ~165 |
| Directories | ~75 |
| Confirmed duplicates | 1 |
| Likely orphans | 5-10 |
| Well-organized directories | 15 |
| Needs reorganization | 150+ root files |

---

## Immediate Actions

### DELETE - Confirmed Duplicates

```bash
# Old implementation, replaced by engagement-notification-service.ts
rm src/services/engagement-notifications.ts
```

### REVIEW - Likely Orphans

These files have minimal or no imports. Verify before deleting:

| File | Reason | Action |
|------|--------|--------|
| `learned-memories.ts` | No direct imports found | Review |
| `optimization-api.ts` | Dashboard-only, may be dead | Review |
| `spontaneous-sharing.ts` | Only in test file (1 usage) | Review |
| `seed-economy.ts` | Reward economy appears unused | Review |
| `first-taste-trial.ts` | Trial system needs verification | Review |

```bash
# Check for imports before deleting
grep -r "learned-memories" src/ --include="*.ts" | grep -v ".test."
grep -r "optimization-api" src/ --include="*.ts" | grep -v ".test."
grep -r "spontaneous-sharing" src/ --include="*.ts" | grep -v ".test."
grep -r "seed-economy" src/ --include="*.ts" | grep -v ".test."
```

---

## Well-Organized Directories (Keep As-Is)

These directories have clear purpose and good internal organization:

| Directory | Files | Purpose |
|-----------|-------|---------|
| `superhuman/` | 10+ | "Better than Human" capabilities |
| `trust-systems/` | 41 | Trust-building patterns |
| `outreach/` | 15+ | Proactive messaging delivery |
| `calendar/` | 30+ | Multi-provider calendar integration |
| `contacts/` | 10+ | Contact & relationship management |
| `coaching/` | 10+ | Life coaching frameworks |
| `self-healing/` | 5+ | Error recovery patterns |
| `predictive-insights/` | 10+ | Burnout/mood/goal predictions |
| `games/` | 20+ | Text-based games |
| `brand/` | 5 | Brand consistency rules |
| `monetization/` | 10+ | Payment & monetization |
| `principal-alignment/` | 5+ | Values & ethics checking |
| `therapeutic-frameworks/` | 5+ | ACT, DBT, MI frameworks |
| `scientific-knowledge/` | 5+ | Behavior science references |
| `observability/` | 10+ | Metrics, health, cost tracking |

---

## Proposed Directory Restructure

Move 165+ root-level files into logical directories:

### Memory Services (`src/services/memory/`)

| Current Location | New Location |
|------------------|--------------|
| `cognitive-memory.ts` | `memory/cognitive-memory.ts` |
| `cognitive-persistence.ts` | `memory/cognitive-persistence.ts` |
| `realtime-memory.ts` | `memory/realtime-memory.ts` |
| `voice-memory.ts` | `memory/voice-memory.ts` |
| `voice-conversation-memory.ts` | `memory/voice-conversation-memory.ts` |
| `human-listening-memory.ts` | `memory/human-listening-memory.ts` |
| `collective-learning-store.ts` | `memory/collective-learning-store.ts` |
| `memory-management.ts` | `memory/memory-management.ts` |
| `memory-monitor.ts` | `memory/memory-monitor.ts` |
| `persona-memories.ts` | `memory/persona-memories.ts` |

### Voice Services (`src/services/voice/`)

| Current Location | New Location |
|------------------|--------------|
| `voice-identification.ts` | `voice/voice-identification.ts` |
| `voice-enrollment.ts` | `voice/voice-enrollment.ts` |
| `voice-antispoofing.ts` | `voice/voice-antispoofing.ts` |
| `voice-liveness.ts` | `voice/voice-liveness.ts` |
| `voice-profile-store.ts` | `voice/voice-profile-store.ts` |
| `voice-audit-log.ts` | `voice/voice-audit-log.ts` |
| `voice-speaker-change.ts` | `voice/voice-speaker-change.ts` |
| `voice-call.ts` | `voice/voice-call.ts` |
| `voice-adaptation.ts` | `voice/voice-adaptation.ts` |
| `voice-household.ts` | `voice/voice-household.ts` |
| `voice-humanization-metrics.ts` | `voice/voice-humanization-metrics.ts` |
| `voice-presence-analytics.ts` | `voice/voice-presence-analytics.ts` |
| `voice-rate-limit.ts` | `voice/voice-rate-limit.ts` |
| `dynamic-voice-parameters.ts` | `voice/dynamic-voice-parameters.ts` |
| `cartesia-voice-localization.ts` | `voice/cartesia-voice-localization.ts` |

### Identity Services (`src/services/identity/`)

| Current Location | New Location |
|------------------|--------------|
| `user-identification.ts` | `identity/user-identification.ts` |
| `natural-auth.ts` | `identity/natural-auth.ts` |
| `firebase-auth.ts` | `identity/firebase-auth.ts` |
| `spotify-auth.ts` | `identity/spotify-auth.ts` |
| `google-calendar-oauth.ts` | `identity/google-calendar-oauth.ts` |
| `geo-detection.ts` | `identity/geo-detection.ts` |

### Engagement Services (`src/services/engagement/`)

| Current Location | New Location |
|------------------|--------------|
| `engagement-notification-service.ts` | `engagement/notification-service.ts` |
| `engagement-store.ts` | `engagement/store.ts` |
| `engagement-conversation-triggers.ts` | `engagement/conversation-triggers.ts` |
| `gamification-store.ts` | `engagement/gamification-store.ts` |
| `team-engagement.ts` | `engagement/team-engagement.ts` |

### Scheduling Services (`src/services/scheduling/`)

| Current Location | New Location |
|------------------|--------------|
| `reminder-scheduler.ts` | `scheduling/reminder-scheduler.ts` |
| `proactive-scheduler.ts` | `scheduling/proactive-scheduler.ts` |
| `calendar-reminders.ts` | `scheduling/calendar-reminders.ts` |
| `calendar-busy-detection.ts` | `scheduling/busy-detection.ts` |
| `appointment-integration.ts` | `scheduling/appointment-integration.ts` |
| `appointment-followup.ts` | `scheduling/appointment-followup.ts` |
| `background-tasks.ts` | `scheduling/background-tasks.ts` |

### Personalization Services (`src/services/personalization/`)

| Current Location | New Location |
|------------------|--------------|
| `persona-modes.ts` | `personalization/persona-modes.ts` |
| `persona-behavior-manager.ts` | `personalization/behavior-manager.ts` |
| `profile-personalizer.ts` | `personalization/profile-personalizer.ts` |
| `humanizing-state.ts` | `personalization/humanizing-state.ts` |
| `mood-drift.ts` | `personalization/mood-drift.ts` |
| `emotion-detection.ts` | `personalization/emotion-detection.ts` |
| `cultural-awareness.ts` | `personalization/cultural-awareness.ts` |
| `ferni-awareness.ts` | `personalization/ferni-awareness.ts` |
| `embodied-awareness.ts` | `personalization/embodied-awareness.ts` |

### Deployment Services (`src/services/deployment/`)

| Current Location | New Location |
|------------------|--------------|
| `auto-rollback.ts` | `deployment/auto-rollback.ts` |
| `canary-deployment.ts` | `deployment/canary-deployment.ts` |
| `post-deploy-verification.ts` | `deployment/post-deploy-verification.ts` |
| `container-watchdog.ts` | `deployment/container-watchdog.ts` |
| `health-checks.ts` | `deployment/health-checks.ts` |
| `startup-validation.ts` | `deployment/startup-validation.ts` |
| `shutdown.ts` | `deployment/shutdown.ts` |
| `scheduled-backups.ts` | `deployment/scheduled-backups.ts` |

### Analytics Services (`src/services/analytics/`)

| Current Location | New Location |
|------------------|--------------|
| `user-analytics.ts` | `analytics/user-analytics.ts` |
| `tool-usage-analytics.ts` | `analytics/tool-usage-analytics.ts` |
| `humanization-analytics.ts` | `analytics/humanization-analytics.ts` |
| `outreach-analytics.ts` | `analytics/outreach-analytics.ts` |
| `call-quality-monitor.ts` | `analytics/call-quality-monitor.ts` |
| `dora-metrics.ts` | `analytics/dora-metrics.ts` |
| `latency-tracker.ts` | `analytics/latency-tracker.ts` |
| `persistence-metrics.ts` | `analytics/persistence-metrics.ts` |
| `better-than-human-telemetry.ts` | `analytics/better-than-human-telemetry.ts` |

### Stores (`src/services/stores/`)

| Current Location | New Location |
|------------------|--------------|
| `productivity-store.ts` | `stores/productivity-store.ts` |
| `life-data-store.ts` | `stores/life-data-store.ts` |
| `financial-store.ts` | `stores/financial-store.ts` |
| `session-cache.ts` | `stores/session-cache.ts` |
| `conversation-history.ts` | `stores/conversation-history.ts` |

### External Integrations (`src/services/external/`)

| Current Location | New Location |
|------------------|--------------|
| `external-apis.ts` | `external/external-apis.ts` |
| `google-places.ts` | `external/google-places.ts` |
| `twilio-sms.ts` | `external/twilio-sms.ts` |
| `twilio-webhooks.ts` | `external/twilio-webhooks.ts` |
| `food-delivery.ts` | `external/food-delivery.ts` |
| `restaurant-reservations.ts` | `external/restaurant-reservations.ts` |
| `yelp.ts` | `external/yelp.ts` |
| `itunes.ts` | `external/itunes.ts` |

### Session Services (`src/services/session/`)

| Current Location | New Location |
|------------------|--------------|
| `session-manager.ts` | `session/session-manager.ts` |
| `session-data-manager.ts` | `session/data-manager.ts` |
| `session-variety-tracker.ts` | `session/variety-tracker.ts` |
| `session-time-limit.ts` | `session/time-limit.ts` |
| `conversation-manager.ts` | `session/conversation-manager.ts` |
| `conversation-state.ts` | `session/conversation-state.ts` |

### Core Services (Keep at Root)

These are foundational and should stay at the root:

| File | Reason |
|------|--------|
| `global-services.ts` | Core infrastructure |
| `agent-bus.ts` | Inter-persona messaging |
| `di/` | Dependency injection |

---

## Migration Script

Create barrel exports for backward compatibility:

```typescript
// src/services/memory/index.ts
export * from './cognitive-memory.js';
export * from './cognitive-persistence.js';
export * from './realtime-memory.js';
export * from './voice-memory.js';
// ... etc

// Then in src/services/index.ts (or individual files)
// Re-export for backward compatibility
export * from './memory/index.js';
```

---

## Service Categories Reference

### Core (Essential Business Logic)

| Service | Purpose | Criticality |
|---------|---------|-------------|
| `session-manager.ts` | Session lifecycle | Critical |
| `agent-bus.ts` | Inter-persona messaging | Critical |
| `global-services.ts` | Service initialization | Critical |
| `user-identification.ts` | User auth flows | Critical |
| `conversation-state.ts` | Tool orchestration | Critical |

### Domain-Specific

| Category | Services | Count |
|----------|----------|-------|
| Music/DJ | `dj-orchestrator`, `dj-service`, `dj-session.service` | 3 |
| Habits | `habits/`, `habit-routes` | 5+ |
| Calendar | `calendar/`, 30+ subdirectories | 30+ |
| Contacts | `contacts/`, relationship management | 10+ |
| Coaching | `coaching/`, therapeutic frameworks | 15+ |
| Games | `games/`, 15+ text games | 20+ |

### Infrastructure

| Category | Services | Count |
|----------|----------|-------|
| Observability | `observability/`, metrics, health | 10+ |
| Deployment | Auto-rollback, canary, watchdog | 7 |
| Caching | `cache/`, warming, monitoring | 5+ |
| Rate Limiting | `rate-limiter`, voice-specific | 3 |

### Intelligence

| Category | Services | Count |
|----------|----------|-------|
| Predictive | `predictive-insights/`, 10+ models | 10+ |
| Cognitive | `cognitive-intelligence/`, patterns | 10+ |
| Cross-Persona | Insights, coordination | 5+ |
| Emotional | Emotion analysis, Hume API | 5+ |

---

## Naming Conventions to Adopt

### File Suffixes

| Suffix | Purpose | Example |
|--------|---------|---------|
| `.service.ts` | Business logic | `calendar.service.ts` |
| `.store.ts` | Data storage | `engagement.store.ts` |
| `.repository.ts` | Data access | `user.repository.ts` |
| `-orchestrator.ts` | Multi-service coordination | `dj-orchestrator.ts` |
| `-manager.ts` | Lifecycle management | `session-manager.ts` |
| `-handler.ts` | Event/webhook processing | `webhook-handler.ts` |

### Directory Structure

```
src/services/{domain}/
├── index.ts           # Barrel export
├── {domain}.service.ts # Main service
├── {domain}.store.ts   # Data storage (if needed)
├── {domain}.types.ts   # Types (if needed)
└── {subdomain}/       # Sub-features
```

---

## Validation After Reorganization

```bash
# After each move:
pnpm typecheck        # Verify imports resolve
pnpm lint             # Check for issues
pnpm test             # Run tests
pnpm quality:arch     # Verify no layer violations

# Final validation:
pnpm quality          # Full quality check
```
