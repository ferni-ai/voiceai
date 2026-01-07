# Context Builders Migration Tracker

> **"Better than human requires better than average organization."**

This is the working document for tracking the context-builders rationalization. Update as you complete each task.

**Last Updated:** January 2026
**Status:** 📋 Phase 1 - Audit Complete

---

## Phase Status

| Phase | Description | Status | Progress |
|-------|-------------|--------|----------|
| 1 | Documentation & Audit | ✅ Complete | 100% |
| 2 | Behavioral Migration | ✅ Complete | 9 behavioral builders |
| 3 | Folder Organization | ✅ Complete | 145 files organized |
| 4 | Naming Standardization | ✅ Complete | 12 files renamed |
| 5 | Import Updates | ✅ Complete | 0 TS errors |
| 6 | Clean Up & Documentation | ✅ Complete | Tracker updated |

---

## Current State: Active vs Disabled Builders

### SAFETY Category (3 ACTIVE)
| Builder | Status | File Location | Notes |
|---------|--------|---------------|-------|
| `crisis` | ✅ Active | `core/crisis.ts` | P0 - Always runs |
| `wellbeing-context` | ✅ Active | `core/wellbeing-context.ts` | P0 - Always runs |
| `principal-alignment` | ✅ Active | `principal-alignment.ts` | Value alignment |

### EMOTIONAL Category (3 ACTIVE, 1 DISABLED)
| Builder | Status | File Location | Notes |
|---------|--------|---------------|-------|
| `emotional` | ❌ DISABLED | `emotional/` | → Migrated to `emotional.behavioral.ts` |
| `celebration` | ✅ Active | `emotional/celebration.ts` | |
| `celebration-growth` | ✅ Active | `emotional/celebration-growth.ts` | |
| `somatic-context` | ✅ Active | `somatic-context.ts` | |

### VOICE Category (6 ACTIVE)
| Builder | Status | File Location | Notes |
|---------|--------|---------------|-------|
| `voice-mismatch-critical` | ✅ Active | `voice-mismatch-critical.ts` | THE superhuman signal |
| `voice-emotion` | ✅ Active | `emotional/voice-emotion.ts` | |
| `advanced-voice-emotion` | ✅ Active | `emotional/advanced-voice-emotion.ts` | |
| `voice-emotion-intelligence` | ✅ Active | `emotional/voice-emotion-intelligence.ts` | |
| `emotional-contagion-timing` | ✅ Active | `emotional/emotional-contagion-timing.ts` | |
| `human-listening` | ✅ Active | `human-listening.ts` | |

### MEMORY Category (13 ACTIVE, 4 DISABLED)
| Builder | Status | File Location | Notes |
|---------|--------|---------------|-------|
| `superhuman-session-priming` | ✅ Active | `superhuman-session-priming.ts` | |
| `better-than-human-memory` | ✅ Active | `memory/better-than-human-memory.ts` | P0 proactive |
| `unified-memory-orchestrator` | ✅ Active | `memory/unified-memory-orchestrator.ts` | PRIMARY |
| `knowledge-graph` | ✅ Active | `memory/knowledge-graph-context.ts` | |
| `memory` | ❌ DISABLED | `memory/memory.ts` | → Consolidated into orchestrator |
| `advanced-memory` | ❌ DISABLED | `memory/advanced-memory.ts` | → Consolidated into orchestrator |
| `proactive-memory` | ❌ DISABLED | `memory/proactive-memory.ts` | → Consolidated into orchestrator |
| `persona-memory` | ✅ Active | `personas/persona-memory.ts` | Unique value |
| `human-memory` | ❌ DISABLED | `memory/human-memory.ts` | → Consolidated into orchestrator |
| `conversation-recap` | ✅ Active | `session/conversation-recap.ts` | |
| `cross-session-reflection` | ✅ Active | `session/cross-session-reflection.ts` | |
| `cross-session-threading` | ✅ Active | `session/cross-session-threading.ts` | |
| `thinking-of-you` | ✅ Active | `thinking-of-you.ts` | |
| `memory-enhancement` | ✅ Active | `memory-enhancement.ts` | |
| `semantic-intelligence-integration` | ✅ Active | `superhuman/semantic-intelligence-integration.ts` | |
| `generated-insights` | ✅ Active | `superhuman/generated-insights.ts` | |

### PERSONA Category (23 ACTIVE)
| Builder | Status | File Location | Notes |
|---------|--------|---------------|-------|
| `twin-profile-context` | ✅ Active | `twin-profile-context.ts` | |
| `persona-identity` | ✅ Active | `personas/persona-identity.ts` | |
| `persona-quirks` | ✅ Active | `personas/persona-quirks.ts` | |
| `persona-playful` | ✅ Active | `personas/persona-playful.ts` | |
| `persona-vulnerability` | ✅ Active | `personas/persona-vulnerability.ts` | |
| `persona-mood` | ✅ Active | `personas/persona-mood.ts` | |
| `human-personality` | ✅ Active | `human-personality.ts` | |
| `ferni-personality` | ✅ Active | `ferni-personality.ts` | |
| `ferni-coordinator-insights` | ✅ Active | `personas/ferni-coordinator-insights.ts` | |
| `peter-research-insights` | ✅ Active | `personas/peter-research-insights/index.ts` | |
| `maya-coaching-insights` | ✅ Active | `personas/maya-coaching-insights/index.ts` | |
| `jordan-milestone-insights` | ✅ Active | `personas/jordan-milestone-insights/index.ts` | |
| `nayan-wisdom-insights` | ✅ Active | `personas/nayan-wisdom-insights.ts` | |
| `alex-communication-insights` | ✅ Active | `personas/alex-communication-insights/index.ts` | |
| `joel-dickson-insights` | ✅ Active | `personas/joel-dickson-insights/index.ts` | |
| `better-than-human-direct` | ✅ Active | `better-than-human-direct.ts` | |
| `conversational-superpowers` | ✅ Active | `conversational-superpowers.ts` | |
| `conversation-forward` | ✅ Active | `session/conversation-forward.ts` | |
| `alive-awareness` | ✅ Active | `awareness/alive-awareness.ts` | |
| `inner-world-injector` | ✅ Active | `inner-world-injector.ts` | |
| `spontaneous-vulnerability` | ✅ Active | `spontaneous-vulnerability.ts` | |
| `physical-presence` | ✅ Active | `physical-presence.ts` | |
| `lovable-presence` | ✅ Active | `lovable-presence.ts` | |

### COACHING Category (8 ACTIVE)
| Builder | Status | File Location | Notes |
|---------|--------|---------------|-------|
| `coaching-context` | ✅ Active | `coaching/coaching-context.ts` | |
| `life-coaching-context` | ✅ Active | `life-coaching-context.ts` | |
| `scientific-coaching` | ✅ Active | `coaching/scientific-coaching.ts` | |
| `therapeutic-frameworks` | ✅ Active | `coaching/therapeutic-frameworks.ts` | |
| `behavioral-economics` | ✅ Active | `coaching/behavioral-economics.ts` | |
| `methodology` | ✅ Active | `methodology.ts` | |
| `maya-habit-insights` | ✅ Active | `personas/maya-habit-insights.ts` | |
| `prediction-surfacing` | ✅ Active | `prediction-surfacing.ts` | |

### COGNITIVE Category (10 ACTIVE)
| Builder | Status | File Location | Notes |
|---------|--------|---------------|-------|
| `unified-intelligence` | ✅ Active | `unified-intelligence-context.ts` | |
| `deep-understanding` | ✅ Active | `deep-understanding.ts` | |
| `awareness` | ✅ Active | `awareness/awareness.ts` | |
| `cognitive` | ✅ Active | `cognitive.ts` | |
| `cognitive-quirks` | ✅ Active | `coaching/cognitive-quirks.ts` | |
| `cognitive-distortions` | ✅ Active | `coaching/cognitive-distortions.ts` | |
| `cognitive-insights` | ✅ Active | `coaching/cognitive-insights.ts` | |
| `pattern-surfacing` | ✅ Active | `pattern-surfacing.ts` | |
| `superhuman-insights` | ✅ Active | `superhuman/superhuman-insights.ts` | |
| `life-context-synthesis` | ✅ Active | `life-context-synthesis.ts` | |

### ENGAGEMENT Category (8 ACTIVE)
| Builder | Status | File Location | Notes |
|---------|--------|---------------|-------|
| `engagement` | ✅ Active | `engagement.ts` | |
| `engagement-context` | ✅ Active | `engagement-context.ts` | |
| `game-context` | ✅ Active | `game-context.ts` | |
| `storytelling` | ✅ Active | `storytelling.ts` | |
| `music` | ✅ Active | `music.ts` | |
| `music-emotion-offers` | ✅ Active | `music-emotion-offers.ts` | |
| `daily-rituals` | ✅ Active | `daily-rituals.ts` | |
| `outreach-awareness` | ✅ Active | `awareness/outreach-awareness.ts` | |

### TEAM Category (8 ACTIVE)
| Builder | Status | File Location | Notes |
|---------|--------|---------------|-------|
| `team-availability` | ✅ Active | `superhuman/team-availability.ts` | |
| `team-dynamics` | ✅ Active | `superhuman/team-dynamics.ts` | |
| `handoff` | ✅ Active | `superhuman/handoff.ts` | |
| `semantic-intent-guidance` | ✅ Active | `semantic-intent-guidance.ts` | |
| `role-boundaries` | ✅ Active | `role-boundaries.ts` | |
| `cameo-opportunities` | ✅ Active | `cameo-opportunities.ts` | |
| `cameo-unlock` | ✅ Active | `cameo-unlock.ts` | |
| `team-gossip` | ✅ Active | `superhuman/team-gossip.ts` | |

### CONTEXT Category (17 ACTIVE, 1 DISABLED)
| Builder | Status | File Location | Notes |
|---------|--------|---------------|-------|
| `outbound-call-context` | ✅ Active | `outbound-call-context.ts` | |
| `domain-fluency` | ✅ Active | `domain-fluency.ts` | |
| `tool-capabilities` | ✅ Active | `tool-capabilities.ts` | |
| `dynamic-tool-guidance` | ✅ Active | `dynamic-tool-guidance.ts` | |
| `tool-timing-context` | ✅ Active | `tool-timing-context.ts` | |
| `intent` | ✅ Active | `intent.ts` | |
| `topics` | ✅ Active | `topics.ts` | |
| `discovery` | ✅ Active | `discovery.ts` | |
| `personal` | ✅ Active | `personal.ts` | |
| `pacing` | ❌ DISABLED | - | → Migrated to `pacing.behavioral.ts` |
| `meta-conversation` | ✅ Active | `meta-conversation.ts` | |
| `situational-awareness` | ✅ Active | `awareness/situational-awareness.ts` | |
| `trust-context` | ✅ Active | `trust-context.ts` | |
| `relationship-behaviors` | ✅ Active | `relationship-behaviors.ts` | |
| `session-flow` | ✅ Active | `session/session-flow.ts` | |
| `calendar-awareness` | ✅ Active | `awareness/calendar-awareness.ts` | |
| `contact-awareness` | ✅ Active | `awareness/contact-awareness.ts` | |
| `message-review-awareness` | ✅ Active | `awareness/message-review-awareness.ts` | |
| `goodbye` | ✅ Active | `goodbye.ts` | |
| `rag` | ✅ Active | `memory/rag.ts` | |
| `tasks` | ✅ Active | `tasks.ts` | |

### EXTERNAL Category (10 ACTIVE)
| Builder | Status | File Location | Notes |
|---------|--------|---------------|-------|
| `biometrics` | ✅ Active | `biometrics.ts` | |
| `career-awareness` | ✅ Active | `awareness/career-awareness.ts` | |
| `device-awareness` | ✅ Active | `awareness/device-awareness.ts` | |
| `linkedin-awareness` | ✅ Active | `awareness/linkedin-awareness.ts` | |
| `financial-prediction` | ✅ Active | `financial-prediction.ts` | |
| `anticipation` | ✅ Active | `anticipation.ts` | |
| `social-relationships` | ✅ Active | `social-relationships.ts` | |
| `world-awareness` | ✅ Active | `awareness/world-awareness.ts` | |
| `macos-context` | ✅ Active | `macos-context.ts` | |
| `personal-journey` | ✅ Active | `personal-journey.ts` | |

### HUMANIZING Category (15 ACTIVE, 7 DISABLED)
| Builder | Status | File Location | Notes |
|---------|--------|---------------|-------|
| `first-meeting-magic` | ✅ Active | `relationship-arc/first-meeting-magic.ts` | |
| `acquaintance-deepening` | ✅ Active | `relationship-arc/acquaintance-deepening.ts` | |
| `friendship-flowering` | ✅ Active | `relationship-arc/friendship-flowering.ts` | |
| `trusted-advisor` | ✅ Active | `relationship-arc/trusted-advisor.ts` | |
| `revelation-awareness` | ✅ Active | `revelation-awareness.ts` | |
| `dynamic-speech-guidance` | ✅ Active | `dynamic-speech-guidance.ts` | |
| `unified-humanizing` | ✅ Active | `humanization/unified-humanizing.ts` | |
| `humanizing` | ❌ DISABLED | `humanization/humanizing.ts` | → Consolidated into unified |
| `deep-humanization` | ❌ DISABLED | `humanization/deep-humanization.ts` | → Consolidated into unified |
| `conversation-humanizing` | ❌ DISABLED | `humanization/conversation-humanizing.ts` | → Consolidated into unified |
| `natural-uncertainty` | ❌ DISABLED | `natural-uncertainty.ts` | → Consolidated into unified |
| `response-length` | ❌ DISABLED | `response-length.ts` | → Consolidated into unified |
| `energy-mirroring` | ❌ DISABLED | `emotional/energy-mirroring.ts` | → Consolidated into unified |
| `energy-awareness` | ❌ DISABLED | `emotional/energy-awareness.ts` | → Consolidated into unified |
| `tool-humanization` | ✅ Active | `humanization/tool-humanization.ts` | NOT consolidated |
| `conversational-imperfections` | ✅ Active | `conversational-imperfections.ts` | |
| `proactive-noticing` | ✅ Active | `proactive-noticing.ts` | |
| `commitment-follow-up` | ✅ Active | `commitment-follow-up.ts` | |
| `temporal-intelligence` | ✅ Active | `temporal-intelligence.ts` | |
| `deep-relationship` | ✅ Active | `deep-relationship.ts` | |

### LEARNING Category (2 ACTIVE)
| Builder | Status | File Location | Notes |
|---------|--------|---------------|-------|
| `community-learning` | ✅ Active | `community-learning.ts` | |
| `wisdom-synthesis` | ✅ Active | `wisdom-synthesis.ts` | |

---

## Summary Statistics

| Category | Active | Disabled | Total |
|----------|--------|----------|-------|
| SAFETY | 3 | 0 | 3 |
| EMOTIONAL | 3 | 1 | 4 |
| VOICE | 6 | 0 | 6 |
| MEMORY | 13 | 4 | 17 |
| PERSONA | 23 | 0 | 23 |
| COACHING | 8 | 0 | 8 |
| COGNITIVE | 10 | 0 | 10 |
| ENGAGEMENT | 8 | 0 | 8 |
| TEAM | 8 | 0 | 8 |
| CONTEXT | 17 | 1 | 18 |
| EXTERNAL | 10 | 0 | 10 |
| HUMANIZING | 15 | 7 | 22 |
| LEARNING | 2 | 0 | 2 |
| **TOTAL** | **126** | **13** | **139** |

### Behavioral System Progress

| Builder | Legacy Status | Behavioral Version | Notes |
|---------|---------------|-------------------|-------|
| `emotional` | ❌ Disabled | ✅ `emotional.behavioral.ts` | Complete |
| `pacing` | ❌ Disabled | ✅ `pacing.behavioral.ts` | Complete |
| `memory` | ❌ Disabled | ✅ `memory.behavioral.ts` | Complete |
| `distress` | ✅ Active (crisis) | ✅ `distress.behavioral.ts` | Parallel |
| `awareness` | ✅ Active | ✅ `awareness.behavioral.ts` | Parallel |
| `humanizing` | ❌ Disabled | ✅ `humanizing.behavioral.ts` | Complete |
| `validation` | N/A | ✅ `validation.behavioral.ts` | New |
| `energy` | ❌ Disabled | ✅ `energy.behavioral.ts` | Complete |

**Behavioral builders done:** 8
**Legacy builders remaining:** ~120+
**Target behavioral builders:** 40+ (core categories)

---

## Files at Root Level (80 files to organize)

### To `intelligence/` (12 files)
- [ ] `temporal-intelligence.ts`
- [ ] `pattern-surfacing.ts`
- [ ] `prediction-surfacing.ts`
- [ ] `deep-understanding.ts`
- [ ] `life-context-synthesis.ts`
- [ ] `voice-mismatch-critical.ts`
- [ ] `proactive-noticing.ts`
- [ ] `commitment-follow-up.ts`
- [ ] `sec-intelligence.ts`
- [ ] `unified-intelligence-context.ts`
- [ ] `inner-world-injector.ts`
- [ ] `semantic-intent-guidance.ts`

### To `relationship/` (5 files)
- [ ] `trust-context.ts`
- [ ] `deep-relationship.ts`
- [ ] `relationship-behaviors.ts`
- [ ] `social-relationships.ts`
- [ ] `social-graph-context.ts`

### To `engagement/` (7 files)
- [ ] `engagement.ts`
- [ ] `engagement-context.ts`
- [ ] `game-context.ts`
- [ ] `music.ts`
- [ ] `music-emotion-offers.ts`
- [ ] `daily-rituals.ts`
- [ ] `storytelling.ts`

### To `team/` (3 from root)
- [ ] `role-boundaries.ts`
- [ ] `cameo-opportunities.ts`
- [ ] `cameo-unlock.ts`

### To `safety/` (2 from root)
- [ ] `principal-alignment.ts`
- [ ] `honesty-guardrail.ts`

### To `superhuman/` (3 files)
- [ ] `superhuman-session-priming.ts`
- [ ] `better-than-human-direct.ts`
- [ ] `conversational-superpowers.ts`

### To `external/` (6 files)
- [ ] `biometrics.ts`
- [ ] `financial-prediction.ts`
- [ ] `macos-context.ts`
- [ ] `anticipation.ts`
- [ ] `pending-call-results.ts`
- [ ] `outbound-call-context.ts`

### To `humanization/` (4 files)
- [ ] `conversational-imperfections.ts`
- [ ] `natural-uncertainty.ts`
- [ ] `response-length.ts`
- [ ] `dynamic-speech-guidance.ts`

### To `personas/` (6 files)
- [ ] `ferni-personality.ts`
- [ ] `human-personality.ts`
- [ ] `physical-presence.ts`
- [ ] `lovable-presence.ts`
- [ ] `spontaneous-vulnerability.ts`
- [ ] `twin-profile-context.ts`

### To `awareness/` (1 file)
- [ ] `revelation-awareness.ts`

### To `coaching/` (2 files)
- [ ] `life-coaching-context.ts`
- [ ] `methodology.ts`

### To `session/` (1 file)
- [ ] `thread-context.ts`

### To `memory/` (2 files)
- [ ] `memory-enhancement.ts`
- [ ] `thinking-of-you.ts`

### Stay at root (infrastructure)
- [x] `index.ts`
- [x] `metrics.ts`
- [x] `builder-prioritization.ts`
- [x] `fast-conditional-loading.ts`
- [x] `tiered-execution.ts`
- [x] `dynamic-trigger-utils.ts`
- [x] `persona-insights-cache.ts`
- [x] `goodbye.ts`

### Remaining at root (need categorization)
- [ ] `cognitive.ts` → `coaching/cognitive-base.ts`
- [ ] `personal.ts` → `session/personal-context.ts`
- [ ] `discovery.ts` → `session/discovery-context.ts`
- [ ] `topics.ts` → `session/topics-context.ts`
- [ ] `intent.ts` → `session/intent-context.ts`
- [ ] `tasks.ts` → `session/tasks-context.ts`
- [ ] `somatic-context.ts` → `emotional/somatic-context.ts`
- [ ] `human-listening.ts` → `emotional/human-listening.ts`
- [ ] `community-learning.ts` → `learning/community-learning.ts`
- [ ] `wisdom-synthesis.ts` → `learning/wisdom-synthesis.ts`
- [ ] `meta-conversation.ts` → `session/meta-conversation.ts`
- [ ] `personal-journey.ts` → `external/personal-journey.ts`
- [ ] `referral-prompt.ts` → `engagement/referral-prompt.ts`
- [ ] `mortality-perspective.ts` → `personas/mortality-perspective.ts`
- [ ] `domain-fluency.ts` → `awareness/domain-fluency.ts`
- [ ] `tool-capabilities.ts` → `awareness/tool-capabilities.ts`
- [ ] `dynamic-tool-guidance.ts` → `awareness/dynamic-tool-guidance.ts`
- [ ] `tool-timing-context.ts` → `awareness/tool-timing-context.ts`

---

## Migration Checklist Template

### For each file move:
```markdown
### Moving `{filename}` to `{new_folder}/`

- [ ] Create new folder if needed
- [ ] Move file to new location
- [ ] Update `builder-imports.ts` path
- [ ] Update `BUILDER_MANIFEST` in `loader.ts` (if category changes)
- [ ] Update `BUILDER_CATEGORIES` in `categories.ts` (if needed)
- [ ] Create re-export from old location for backward compat
- [ ] Run `pnpm typecheck`
- [ ] Run `pnpm test`
- [ ] Update any direct imports
```

---

## Folder Structure (COMPLETE ✅)

All folders created and populated:
- [x] `awareness/` - 16 files (external world facts)
- [x] `coaching/` - 10 files (therapeutic frameworks)
- [x] `emotional/` - 10 files (emotion detection/response)
- [x] `engagement/` - 8 files (user engagement)
- [x] `external/` - 7 files (external integrations)
- [x] `humanization/` - 10 files (natural speech patterns)
- [x] `intelligence/` - 12 files ("Better Than Human" capabilities)
- [x] `learning/` - 2 files (collective intelligence)
- [x] `memory/` - 11 files (memory systems)
- [x] `personas/` - 16 files (persona-specific behavior)
- [x] `relationship/` - 5 files + arc/ subfolder
- [x] `safety/` - 4 files (crisis detection, wellbeing)
- [x] `session/` - 12 files (session-level state)
- [x] `superhuman/` - 7 files (superhuman capabilities)
- [x] `team/` - 7 files (multi-persona coordination)
- [x] `behavioral/` - 10 files (behavioral signal builders)
- [x] `core/` - 9 files (infrastructure)

---

## Notes & Decisions

### Decided
1. Keep behavioral system as migration target
2. Domain-driven organization over technical organization
3. One naming convention per purpose type
4. Backward compatible via re-exports
5. `personas/` stays well-organized as-is

### Open Questions
1. Should disabled legacy builders be deleted or kept for reference?
2. How aggressively to pursue behavioral migration?
3. Timeline for deprecating re-exports?

---

*Updated as migration progresses.*
