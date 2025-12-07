# Services Directory Reorganization Plan

**Status**: Proposed  
**Author**: AI Assistant  
**Date**: 2024-12-06

## Overview

The `src/services/` directory currently contains 122 files in a mostly flat structure. This plan outlines a phased approach to reorganize services into logical domain-based subdirectories.

## Current State

```
src/services/
├── di/                          # ✅ Already organized (6 files)
├── humanization/                # ✅ Already organized (1 file)
├── observability/               # ✅ Already organized (9 files)
├── team-handler-registry/       # ✅ Already organized (8 files)
└── [100+ flat files]            # ❌ Needs organization
```

## Proposed Structure

```
src/services/
├── index.ts                     # Barrel file for public API
│
├── appointments/                # Calendar & appointment services
│   ├── index.ts
│   ├── followup.ts              # appointment-followup.ts
│   ├── integration.ts           # appointment-integration.ts
│   └── calendar-reminders.ts
│
├── cognitive/                   # Cognitive services
│   ├── index.ts
│   ├── broadcast.ts             # cognitive-broadcast.ts
│   ├── memory.ts                # cognitive-memory.ts
│   ├── persistence.ts           # cognitive-persistence.ts
│   ├── session-hooks.ts         # cognitive-session-hooks.ts
│   └── websocket.ts             # cognitive-websocket.ts
│
├── communication/               # Communication services
│   ├── index.ts
│   ├── service.ts               # communication-service.ts
│   ├── contacts.ts              # contacts.ts
│   └── contact-onboarding.ts
│
├── conversation/                # Conversation management
│   ├── index.ts
│   ├── history.ts               # conversation-history.ts
│   ├── manager.ts               # conversation-manager.ts
│   └── state.ts                 # conversation-state.ts
│
├── engagement/                  # User engagement
│   ├── index.ts
│   ├── conversation-triggers.ts # engagement-conversation-triggers.ts
│   ├── data-sender.ts           # engagement-data-sender.ts
│   ├── notifications.ts         # engagement-notifications.ts
│   ├── store.ts                 # engagement-store.ts
│   └── team-engagement.ts       # team-engagement.ts
│
├── experiments/                 # A/B testing & experiments
│   ├── index.ts
│   ├── advanced.ts              # experiment-advanced.ts
│   ├── api.ts                   # experiment-api.ts
│   └── integration.ts           # experiment-integration.ts
│
├── humanization/                # ✅ Already exists
│   └── index.ts
│
├── integrations/                # External service integrations
│   ├── index.ts
│   ├── food-delivery.ts
│   ├── google-calendar-oauth.ts
│   ├── google-places.ts
│   ├── itunes.ts
│   ├── restaurant-reservations.ts
│   ├── spotify-auth.ts
│   ├── yelp.ts
│   └── twilio-webhooks.ts
│
├── maya/                        # Maya persona services
│   ├── index.ts
│   ├── financial-store.ts       # maya-financial-store.ts
│   ├── gamification-store.ts    # maya-gamification-store.ts
│   └── notification-service.ts  # maya-notification-service.ts
│
├── memory/                      # Memory & learning services
│   ├── index.ts
│   ├── learned-memories.ts
│   ├── management.ts            # memory-management.ts
│   └── voice-memory.ts
│
├── observability/               # ✅ Already organized
│   └── [9 files]
│
├── optimization/                # Performance optimization
│   ├── index.ts
│   ├── alerting.ts              # optimization-alerting.ts
│   ├── api.ts                   # optimization-api.ts
│   └── persistence.ts           # optimization-persistence.ts
│
├── outreach/                    # Proactive outreach
│   ├── index.ts
│   ├── admin.ts                 # outreach-admin.ts
│   ├── analytics.ts             # outreach-analytics.ts
│   └── intelligence.ts          # outreach-intelligence.ts
│
├── persona/                     # Persona management
│   ├── index.ts
│   ├── behavior-manager.ts      # persona-behavior-manager.ts
│   ├── memories.ts              # persona-memories.ts
│   ├── modes.ts                 # persona-modes.ts
│   └── per-persona-relationship.ts
│
├── proactive/                   # Proactive features
│   ├── index.ts
│   ├── insights-service.ts      # proactive-insights-service.ts
│   └── scheduler.ts             # proactive-scheduler.ts
│
├── session/                     # Session management
│   ├── index.ts
│   ├── context.ts               # session-context.ts
│   └── manager.ts               # session-manager.ts
│
├── team/                        # Team management
│   ├── index.ts
│   ├── manager.ts               # team-manager.ts
│   └── unlocks.ts               # team-unlocks.ts
│
├── team-handler-registry/       # ✅ Already organized
│   └── [8 files]
│
├── voice/                       # Voice services
│   ├── index.ts
│   ├── adaptation.ts            # voice-adaptation.ts
│   ├── call.ts                  # voice-call.ts
│   ├── identification.ts        # voice-identification.ts
│   └── memory.ts                # voice-memory.ts
│
├── di/                          # ✅ Already organized
│   └── [6 files]
│
└── [standalone files]           # Core services that stay at root
    ├── agent-bus.ts
    ├── background-tasks.ts
    ├── cultural-awareness.ts
    ├── daily-rituals.ts
    ├── data-export.ts
    ├── diagnostic-logger.ts
    ├── embodied-awareness.ts
    ├── emotion-detection.ts
    ├── env-validator.ts
    ├── error-tracking.ts
    ├── global-services.ts
    ├── humanization-analytics.ts
    ├── humanizing-state.ts
    ├── intelligence-persistence.ts
    ├── life-data-store.ts
    ├── llm-utils.ts
    ├── milestone-detection.ts
    ├── mood-drift.ts
    ├── natural-auth.ts
    ├── performance-profiler.ts
    ├── persistence-metrics.ts
    ├── productivity-store.ts
    ├── profile-personalizer.ts
    ├── push-notifications.ts
    ├── reminder-scheduler.ts
    ├── ritual-onboarding.ts
    ├── shutdown.ts
    ├── spontaneous-sharing.ts
    ├── startup-validation.ts
    ├── story-tracking.ts
    ├── stripe-subscription.ts
    ├── tool-usage-analytics.ts
    ├── topic-tracking.ts
    ├── types.ts
    └── user-identification.ts
```

## Migration Phases

### Phase 1: Create Directory Structure (Low Risk)
**Timeline**: 1-2 hours  
**Risk**: None - no code changes

1. Create new subdirectories
2. Create barrel files (`index.ts`) for each directory
3. No file moves yet

### Phase 2: Maya Services (Medium Risk)
**Timeline**: 2-3 hours  
**Dependencies**: Low - isolated to Maya persona

Files to move:
- `maya-financial-store.ts` → `maya/financial-store.ts`
- `maya-gamification-store.ts` → `maya/gamification-store.ts`
- `maya-notification-service.ts` → `maya/notification-service.ts`

Steps:
1. Create `maya/index.ts` barrel file
2. Move files with git mv
3. Update imports using find/replace
4. Run tests
5. Update any direct file references

### Phase 3: Cognitive Services (Medium Risk)
**Timeline**: 2-3 hours  
**Dependencies**: Medium - used across agent system

Files to move:
- `cognitive-broadcast.ts` → `cognitive/broadcast.ts`
- `cognitive-memory.ts` → `cognitive/memory.ts`
- `cognitive-persistence.ts` → `cognitive/persistence.ts`
- `cognitive-session-hooks.ts` → `cognitive/session-hooks.ts`
- `cognitive-websocket.ts` → `cognitive/websocket.ts`

### Phase 4: Integration Services (Low Risk)
**Timeline**: 2-3 hours  
**Dependencies**: Low - external service wrappers

Files to move:
- `food-delivery.ts` → `integrations/food-delivery.ts`
- `google-calendar-oauth.ts` → `integrations/google-calendar-oauth.ts`
- `google-places.ts` → `integrations/google-places.ts`
- `itunes.ts` → `integrations/itunes.ts`
- `restaurant-reservations.ts` → `integrations/restaurant-reservations.ts`
- `spotify-auth.ts` → `integrations/spotify-auth.ts`
- `yelp.ts` → `integrations/yelp.ts`
- `twilio-webhooks.ts` → `integrations/twilio-webhooks.ts`

### Phase 5: Remaining Services (Higher Risk)
**Timeline**: 4-6 hours  
**Dependencies**: Higher - core services

Move remaining files in smaller batches, testing between each.

## Import Update Strategy

### Using Barrel Files

Before:
```typescript
import { cognitiveMemory } from '../services/cognitive-memory.js';
import { cognitiveBroadcast } from '../services/cognitive-broadcast.js';
```

After:
```typescript
import { cognitiveMemory, cognitiveBroadcast } from '../services/cognitive/index.js';
// OR
import * as cognitive from '../services/cognitive/index.js';
```

### Automated Import Updates

Use these commands to update imports:

```bash
# Find all files importing from old paths
grep -r "from ['\"].*services/maya-" src/ --include="*.ts"

# Use sed for batch updates (test first!)
find src -name "*.ts" -exec sed -i '' \
  's/from .\.\.\/services\/maya-financial-store/from ..\/services\/maya\/financial-store/g' {} \;
```

## Rollback Plan

If issues arise:
1. Git revert the commit(s)
2. Imports automatically revert
3. No runtime changes needed

## Verification Checklist

For each phase:
- [ ] Run `npm run typecheck` - no new errors
- [ ] Run `npm test` - all tests pass
- [ ] Run `npm run lint` - no lint errors
- [ ] Start dev server - no runtime errors
- [ ] Check key flows manually

## Notes

### Services to Keep at Root Level

These services are fundamental/cross-cutting and should stay at root:
- `global-services.ts` - Main service initialization
- `types.ts` - Shared service types
- `shutdown.ts` - Graceful shutdown
- `agent-bus.ts` - Event bus

### Naming Conventions

When moving files:
- Remove prefix from filename: `maya-financial-store.ts` → `financial-store.ts`
- Keep the service name in the class/export

### Barrel File Template

```typescript
// src/services/[domain]/index.ts

// Re-export all public APIs from this domain
export { ServiceA } from './service-a.js';
export { ServiceB } from './service-b.js';
export type { TypeA, TypeB } from './types.js';
```

## Success Metrics

After reorganization:
- [ ] No more than 50 files at root level
- [ ] All related services grouped together
- [ ] Clear import paths for each domain
- [ ] No broken tests
- [ ] No runtime errors

