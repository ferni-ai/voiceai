# Services Domain Mapping

> Generated during services consolidation - January 2026

## Files to Keep at Root (Cross-cutting)

| File | Reason |
|------|--------|
| `index.ts` | Barrel exports |
| `types.ts` | Shared type definitions |
| `global-services.ts` | Global singleton initialization |
| `agent-bus.ts` | Core messaging infrastructure |
| `rate-limiter.ts` | Cross-cutting rate limiting |

## Domain Mappings

### session/ (Consolidate from session/, session-manager/, session-context/)

| File | Action |
|------|--------|
| `session-manager.ts` | SPLIT then move (2,242 lines) |
| `session-data-manager.ts` | Move |
| `session-time-limit.ts` | Move |
| `session-variety-tracker.ts` | Move |
| `session-warmup.ts` | Move |
| `humanizing-state.ts` | Move |
| `pre-session-briefing.ts` | Move |

### memory/ (Consolidate memory-related)

| File | Action |
|------|--------|
| `unified-memory-service.ts` | SPLIT then move (1,518 lines) |
| `voice-memory-enhanced.ts` | Move |
| `proactive-memory-surfacing.ts` | Move |

### analytics/

| File | Action |
|------|--------|
| `superhuman-analytics.ts` | Move |
| `superhuman-persistence.ts` | Move |
| `subscription-metrics.ts` | Move |
| `handoff-metrics.ts` | Move |

### performance/

| File | Action |
|------|--------|
| `performance-alerts.ts` | Move |
| `performance-instrumentation.ts` | Move |
| `performance-metrics.ts` | Move |
| `performance-profiler.ts` | Move |
| `optimization-alerting.ts` | Move |
| `optimization-persistence.ts` | Move |
| `predictive-alerting.ts` | Move |

### outreach/

| File | Action |
|------|--------|
| `outreach-admin.ts` | Move |
| `outreach-intelligence.ts` | Move |
| `goal-outreach-integration.ts` | Move |
| `push-notifications.ts` | Move |

### integrations/

| File | Action |
|------|--------|
| `external-apis.ts` | Move |
| `slack-notifications.ts` | Move |
| `slack-chatops.ts` | Move |
| `twilio-sms.ts` | Move |
| `twilio-webhooks.ts` | Move |
| `stripe-payments.ts` | Move |
| `stripe-subscription.ts` | Move |
| `apple-iap.ts` | Move |
| `itunes.ts` | Move |
| `google-places.ts` | Move |
| `yelp.ts` | Move |
| `food-delivery.ts` | Move |
| `restaurant-reservations.ts` | Move |
| `developer-mcp-registry.ts` | Move |
| `developer-webhook-dispatcher.ts` | Move |

### voice/

| File | Action |
|------|--------|
| `voice-pack-service.ts` | Move |

### cognitive-intelligence/ (use existing)

| File | Action |
|------|--------|
| `cognitive-broadcast.ts` | Move |
| `cognitive-websocket.ts` | Move |
| `cognitive-session-hooks.ts` | Move |

### cross-persona/ (use existing for insights)

| File | Action |
|------|--------|
| `cross-persona-insights.ts` | SPLIT then move (1,104 lines) |
| `insights-broadcast.ts` | Move |
| `insights-websocket.ts` | Move |
| `intelligence-persistence.ts` | Move |
| `intelligence-publisher.ts` | Move |
| `cross-agent-awareness.ts` | Move |

### scheduling/

| File | Action |
|------|--------|
| `daily-rituals.ts` | Move |
| `ritual-onboarding.ts` | Move |

### identity/

| File | Action |
|------|--------|
| `contact-onboarding.ts` | Move |
| `contacts.ts` | SPLIT then move (1,197 lines) |
| `security-events.ts` | Move |
| `privacy-crypto.ts` | Move |
| `user-migration.ts` | Move |

### engagement/

| File | Action |
|------|--------|
| `celebration-engine.ts` | Move |
| `seed-economy.ts` | Move |
| `growth-visibility-engine.ts` | Move |
| `engagement-data-sender.ts` | Move |

### monetization/

| File | Action |
|------|--------|
| `team-unlocks.ts` | Move |
| `first-taste-trial.ts` | Move |
| `team-manager.ts` | Move |

### data-layer/

| File | Action |
|------|--------|
| `data-export.ts` | Move |
| `firestore-wal-integration.ts` | Move |
| `write-ahead-log.ts` | Move |
| `realtime-persistence.ts` | Move |

### deployment/

| File | Action |
|------|--------|
| `env-validator.ts` | Move |
| `feature-flags.ts` | Move |
| `feature-rollout.ts` | Move |
| `ops-orchestrator.ts` | Move |
| `smart-runbooks.ts` | Move |
| `incident-timeline.ts` | Move |
| `alive-orchestrator.ts` | Move |

### observability/

| File | Action |
|------|--------|
| `error-tracking.ts` | Move |
| `diagnostic-logger.ts` | Move |
| `cache-monitoring.ts` | Move |

### pubsub/

| File | Action |
|------|--------|
| `redis-pubsub.ts` | Move |
| `frontend-signal.ts` | Move |
| `life-context-broadcast.ts` | Move |
| `life-context-websocket.ts` | Move |
| `user-events-websocket.ts` | Move |

### music/ (use existing for DJ)

| File | Action |
|------|--------|
| `dj-service.ts` | Move |

### stores/

| File | Action |
|------|--------|
| `lazy-registry.ts` | Move |
| `cached-imports.ts` | Move |
| `cache-warming.ts` | Move |

### conversation-thread/

| File | Action |
|------|--------|
| `conversation-state.ts` | SPLIT then move (1,067 lines) |
| `conversation-manager.ts` | Move |
| `topic-tracking.ts` | Move |

### llm/ (NEW directory)

| File | Action |
|------|--------|
| `llm-dynamic-content.ts` | SPLIT then move (1,061 lines) |
| `llm-utils.ts` | Move |
| `model-config.ts` | Move |

### workflows/

| File | Action |
|------|--------|
| `workflow-engine.ts` | SPLIT then move (1,024 lines) |

### persona-service/

| File | Action |
|------|--------|
| `persona-behavior-manager.ts` | Move |
| `persona-content-loader.ts` | Move |
| `persona-modes.ts` | Move |
| `per-persona-relationship.ts` | Move |

### context-awareness/

| File | Action |
|------|--------|
| `context-inspection.ts` | Move |
| `cultural-awareness.ts` | Move |
| `ferni-awareness.ts` | Move |
| `embodied-awareness.ts` | Move |
| `day-awareness-cache.ts` | Move |

### emotion-analysis/

| File | Action |
|------|--------|
| `emotion-detection.ts` | Move |
| `mood-drift.ts` | Move |

### coaching/

| File | Action |
|------|--------|
| `profile-personalizer.ts` | Move |
| `milestone-detection.ts` | Move |

### social/

| File | Action |
|------|--------|
| `spontaneous-sharing.ts` | Move |
| `relationship-dashboard.ts` | Move |

### chronicle/

| File | Action |
|------|--------|
| `chronicle-narrative-bridge.ts` | Move |
| `story-tracking.ts` | Move |

### handoff/

| File | Action |
|------|--------|
| (no root files to move) | - |

### admin/

| File | Action |
|------|--------|
| `admin-activity.ts` | Move |

### communication/

| File | Action |
|------|--------|
| `communication-service.ts` | Move |

### group-conversation/ (in conversation-thread or new)

| File | Action |
|------|--------|
| `group-conversation-firestore.ts` | Move to conversation-thread/ |

## Summary

| Category | Count |
|----------|-------|
| Files to keep at root | 5 |
| Files to move | ~95 |
| Files to split (>500 lines) | 8 |
| New directories needed | 1 (llm/) |
| Directories to merge | 3 (session-*, memory-*) |
