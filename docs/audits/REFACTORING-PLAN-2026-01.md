# Comprehensive Refactoring Plan - January 2026

> Generated from deep codebase analysis. Prioritized by impact and effort.

---

## Executive Summary

The codebase is approximately **75% complete** with major systems functional. The primary gaps are in **cross-persona intelligence wiring** where only ~25% of the defined capabilities are actually connected to turn processing.

| Category | Count | Severity |
|----------|-------|----------|
| Cross-Persona Wiring Gaps | 6 persona builders disconnected | **Critical** |
| Superhuman Services Not Wired | 30 of 45 services | High |
| Dead Code | ~1,000 lines | Low |
| Swallowed Errors | ✅ Fixed | Done |
| Unused Imports | ✅ Fixed | Done |

---

## Critical Issues (Wire Before Launch)

### 1. Persona Context Builders Completely Disconnected

**Status:** 🔴 NOT WIRED
**Impact:** Persona-specific insights never reach turn processing
**Effort:** 4-8 hours

The following persona context builders are defined and implemented but **never called**:

| Builder | File | Lines | Status |
|---------|------|-------|--------|
| Peter Research | `context-builders/personas/peter-research-insights/index.ts` | ~8K | 🔴 Not imported |
| Maya Coaching | `context-builders/personas/maya-coaching-insights/index.ts` | ~20K | 🔴 Not imported |
| Jordan Milestone | `context-builders/personas/jordan-milestone-insights/index.ts` | ~15K | 🔴 Not imported |
| Alex Communication | `context-builders/personas/alex-communication-insights/index.ts` | ~12K | 🔴 Not imported |
| Nayan Wisdom | `context-builders/personas/nayan-wisdom-insights/index.ts` | ~18K | 🔴 Not imported |
| Ferni Coordinator | `context-builders/personas/ferni-coordinator-insights/index.ts` | ~10K | 🔴 Not imported |

**Root Cause:** These builders exist in `src/intelligence/context-builders/personas/` but are never imported into:
- `turn-processor.ts`
- `injection-builders.ts`
- Any integration layer

**Fix Required:**
```typescript
// In src/agents/processors/injection-builders.ts
import { buildPeterInsightsContext } from '../../intelligence/context-builders/personas/peter-research-insights/index.js';
// ... similar for each persona

// Add to buildContextInjections():
if (personaId === 'peter') {
  injections.push(await buildPeterInsightsContext(services, sessionContext));
}
```

### 2. Handoff Insight Briefing Never Called

**Status:** 🔴 NOT WIRED
**Impact:** Personas don't receive context when user switches personas
**Effort:** 2-4 hours

```typescript
// Defined in src/services/cross-persona-insights.ts
export async function buildInsightBriefingForHandoff(
  userId: string,
  targetPersonaId: string
): Promise<InsightBriefing> { ... }

// NEVER CALLED from handoff system
// Search result: 0 imports outside definition file
```

**Fix Required:** Call `buildInsightBriefingForHandoff()` from `src/handoff/index.ts` when transitioning between personas.

### 3. 30 Superhuman Services Exported But Not Called

**Status:** 🟡 PARTIAL
**Impact:** "Better than Human" features incomplete
**Effort:** 8-16 hours for full wiring

**Currently Wired (15 services):**
- `loadUserCommitments` ✅
- `assessBurnoutRisk` ✅
- `findDormantDreams` ✅
- `findUpcomingDates` ✅
- `analyzeSilence` ✅
- `detectContradiction` ✅
- `detectReceptivity` ✅
- `recordTopicEnergy` ✅
- Plus 7 others from `better-than-human-integration.ts`

**NOT Wired (30 services):**
- `lifeNarrative.buildContext`
- `valuesAlignment.buildContext`
- `emotionalFirstAid.buildContext`
- `relationshipNetwork.buildContext`
- `anticipatory-planning` functions
- `event-pattern-memory` functions
- `habit-intelligence-services` functions
- `pattern-analytics-services`
- `wisdom-intelligence-services`
- Plus 21 others

---

## High Priority Issues

### 4. Legacy vs Behavioral Context Builders

**Status:** 🟡 Confusing
**Impact:** Maintainability, developer confusion
**Effort:** 4-8 hours to audit and document

```typescript
// src/intelligence/context-builders/index.ts line 23
// Marked as "LEGACY" - code should use ./behavioral/integration.js instead
```

**Action:** Create migration plan from 70+ legacy builders to behavioral system.

### 5. Cross-Persona Insights Uses Legacy API

**Status:** 🟡 PARTIAL
**Impact:** Limited cross-persona intelligence
**Effort:** 2-4 hours

`buildCrossPersonaInsightsInjection()` in injection-builders.ts calls the **old** `buildInsightContext()` API instead of the new:
- `buildInsightBriefingForHandoff()`
- `scanForCrossPersonaInsights()`
- `generateTeamStatus()`

---

## Medium Priority Issues

### 6. Dead Tool Definitions (~1,000 lines)

**Status:** 🟢 Documented, safe to remove
**Impact:** Code noise, maintenance burden
**Effort:** 1-2 hours

| File | Dead Tools | Lines |
|------|------------|-------|
| `domains/presence/index.ts` | 7 tools | ~321 |
| `domains/meaning/index.ts` | 7 tools | ~379 |
| `domains/relationships/index.ts` | 8 tools | ~381 |

**Note:** These are intentionally consolidated (12 → 5 per domain) but dead definitions were not removed. Safe to delete.

### 7. Large Files Needing Refactor (>500 lines)

| File | Lines | Suggested Split |
|------|-------|-----------------|
| `cli/commands/synthetic-e2e.ts` | 3,480 | By test category |
| `agents/voice-agent-entry.ts` | 3,023 | Extract setup, handlers, lifecycle |
| `agents/shared/json-function-executor.ts` | 2,978 | By tool domain |
| `agents/processors/turn-processor.ts` | 2,935 | Extract strategies |
| `personas/meaningful-silence.ts` | 2,406 | Extract detection vs response |

---

## Low Priority / Documentation

### 8. Semantic Router Domain Bridge Fallback

**File:** `src/tools/semantic-router/domain-bridge.ts:1442`

```typescript
// "GRACEFUL FALLBACK: Domain tool not implemented yet"
```

Some domain tools matched by semantic router don't have implementations. This is handled gracefully but should be audited.

### 9. `as any` Usage

**Count:** 496 instances
**Priority:** Low - Address opportunistically during other refactoring

---

## Wiring Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      CURRENT STATE                                       │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Turn Handler (turn-handler.ts)                                         │
│         ↓                                                               │
│  Turn Processor (turn-processor.ts) ←─ buildContextInjections()         │
│         ↓                                                               │
│  Injection Builders (injection-builders.ts)                             │
│         │                                                               │
│    ┌────┴──────────────────────────────────────────┐                    │
│    ↓                                               ↓                    │
│ ✅ buildCrossPersonaInsightsInjection()      ✅ 20 other builders       │
│    │ (uses LEGACY API)                                                  │
│    ↓                                                                    │
│ buildInsightContext() [LEGACY]                                          │
│                                                                         │
│  🔴 NOT CONNECTED:                                                      │
│  ─────────────────                                                      │
│  • Persona Context Builders (peter, maya, jordan, alex, nayan, ferni)   │
│  • buildInsightBriefingForHandoff()                                     │
│  • scanForCrossPersonaInsights()                                        │
│  • generateTeamStatus()                                                 │
│  • 30+ Superhuman Services                                              │
│                                                                         │
│  ✅ WORKING:                                                            │
│  ─────────────────────────────────────────────                          │
│  • better-than-human-integration.ts (15 services)                       │
│  • unified-intelligence-integration.ts                                  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Implementation Order

### Phase 1: Critical Wiring (Week 1)

1. **Wire persona context builders** - 4-8 hours
   - Import builders into injection-builders.ts
   - Add persona-specific context injection
   - Test with each persona

2. **Wire handoff insight briefing** - 2-4 hours
   - Call `buildInsightBriefingForHandoff()` from handoff/index.ts
   - Test persona transitions

### Phase 2: Superhuman Services (Week 2)

3. **Audit superhuman services usage** - 2 hours
   - Identify which of 30 unwired services are most valuable
   - Prioritize by user impact

4. **Wire high-value services** - 8-16 hours
   - Add to better-than-human-integration.ts or create new integration layer
   - Test context injection

### Phase 3: Cleanup (Week 3)

5. **Remove dead tool definitions** - 1-2 hours
   - Delete consolidated tools from presence/meaning/relationships
   - Verify no external references

6. **Document legacy vs behavioral builders** - 4 hours
   - Create migration guide
   - Mark legacy builders clearly

7. **Large file refactoring** - 8-16 hours
   - Start with voice-agent-entry.ts
   - Follow module organization principles from CLAUDE.md

---

## Testing Strategy

### For Context Builder Wiring

```bash
# Run synthetic E2E tests for each persona
pnpm vitest run src/tests/synthetic/persona-context-e2e.test.ts

# Manual test: Verify context injection in logs
LOG_FULL_RESPONSES=true pnpm dev
# Then chat with each persona and check for context injection
```

### For Handoff Wiring

```bash
# Test handoff flow
# 1. Start conversation with Ferni
# 2. Ask to "talk to Peter about stocks"
# 3. Verify Peter receives handoff briefing in logs
```

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Persona builders wired | 0 / 6 | 6 / 6 |
| Superhuman services wired | 15 / 45 | 30 / 45 |
| Handoff briefing working | No | Yes |
| Dead code removed | 0 lines | ~1,000 lines |
| Large files split | 0 / 5 | 3 / 5 |

---

## Files Modified in This Analysis

### Fixed (Committed)

- `src/api/ceo-coaching-routes.ts` - Added error logging to Promise.all catch blocks
- `src/tools/semantic-router/advanced/tool-chains.ts` - Added error logging to Redis operations
- `src/tools/domains/presence/index.ts` - Removed unused `_log` import
- `src/tools/domains/meaning/index.ts` - Removed unused `_log` and `generateToolQuestions` imports
- `src/tools/domains/relationships/index.ts` - Removed unused `_log` import

### To Be Modified (Next Steps)

- `src/agents/processors/injection-builders.ts` - Wire persona context builders
- `src/handoff/index.ts` - Wire handoff insight briefing
- `src/intelligence/context-builders/personas/*.ts` - Verify exports work with turn processor

---

## References

- **Cross-Persona Intelligence:** `docs/architecture/CROSS-PERSONA-INTELLIGENCE.md`
- **Superhuman Services:** `src/services/superhuman/README.md`
- **Context Builders:** `src/intelligence/CLAUDE.md`
- **Turn Processing:** `src/agents/processors/turn-processor.ts`

---

*Generated: January 17, 2026*
*Status: Ready for review and implementation*
