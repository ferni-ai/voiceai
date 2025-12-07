# Tools Directory - Prioritized Action Plan

> Generated: December 7, 2025

## Executive Summary

The tools directory has a solid architecture foundation but contains significant technical debt. This plan prioritizes work by impact and effort.

---

## Priority 1: Critical Fixes (1-2 days)

### 1.1 Remove Debug Console Logs ⚡ (30 mins)
**File:** `music.ts`
**Issue:** 20+ console.log statements violate logging standards
**Fix:** Convert all `console.log()` to `createLogger()` calls

```typescript
// Before
console.log('🎵🎵🎵 [MUSIC DEBUG] playMusicUnified called', {...});

// After
const log = createLogger('tools:music');
log.debug('playMusicUnified called', { query, config: musicConfig });
```

**Status:** ✅ Fixed in this PR

### 1.2 Fix `Tool = any` Type (1 hour)
**File:** `registry/types.ts:226`
**Issue:** `export type Tool = any;` defeats TypeScript safety
**Fix:** Define proper Tool interface

```typescript
// Before
export type Tool = any;

// After
export interface Tool {
  description: string;
  parameters?: z.ZodTypeAny;
  execute: (params: Record<string, unknown>, context?: ToolContext) => Promise<unknown>;
}
```

### 1.3 Add Core Tool Tests (4 hours)
**Files to test:** 
- `handoff/` (already has executor.test.ts ✓)
- `memory-tools.ts` 
- `weather.ts` (simple, good starting point)
- `validation.ts` (pure functions, easy to test)

---

## Priority 2: File Splitting (3-5 days)

### 2.1 Split `habit-coaching.ts` (4,689 lines → ~5 files)

| New File | Content | Est. Lines |
|----------|---------|------------|
| `habit-types/index.ts` | Types, interfaces, life domains, life stages | ~300 |
| `habit-types/four-tendencies.ts` | Four Tendencies framework | ~150 |
| `habit-types/templates.ts` | HABIT_TEMPLATES constant | ~500 |
| `habit-tracking.ts` | Tracking tools (logHabit, getStreak, etc.) | ~800 |
| `habit-coaching.ts` | Coaching tools (recommendations, glidepath) | ~800 |
| `habit-stacking.ts` | Stacking & bundling tools | ~600 |
| `habit-analytics.ts` | Stats, weekly reflections, achievements | ~700 |
| `habit-coaching/index.ts` | Re-exports for backward compatibility | ~100 |

**Effort:** 8-12 hours

### 2.2 Split `scheduling.ts` (2,043 lines → ~4 files)

| New File | Content | Est. Lines |
|----------|---------|------------|
| `scheduling/appointments.ts` | Appointment booking/management | ~500 |
| `scheduling/deliveries.ts` | Delivery tracking | ~400 |
| `scheduling/places.ts` | Places/restaurant search | ~400 |
| `scheduling/contacts.ts` | Contact management | ~300 |
| `scheduling/index.ts` | Re-exports | ~100 |

**Effort:** 4-6 hours

### 2.3 Split Other Large Files

| File | Lines | Priority |
|------|-------|----------|
| `financial-habits.ts` | 1,734 | Medium |
| `engagement/index.ts` | 1,669 | Medium |
| `insights-analysis.ts` | 1,439 | Low |
| `gamification.ts` | 1,380 | Low |
| `communication-coaching.ts` | 1,370 | Low |
| `spotify.ts` | 1,329 | Low |

---

## Priority 3: Migration Completion (5-7 days)

### 3.1 Convert JS Files to TypeScript (4 hours)

| File | Lines | Complexity |
|------|-------|------------|
| `recommendation-engine.js` | 561 | Medium |
| `pattern-analyzer.js` | 478 | Medium |
| `ab-testing.js` | 382 | Low |
| `feedback-collector.js` | 377 | Low |
| `auto-optimizer.js` | 351 | Medium |
| `deprecation.js` | 326 | Low |

### 3.2 Remove Legacy Exports (2 hours)
**File:** `index.ts`
- Remove deprecated `create*Tools()` function exports
- Keep only registry-based exports
- Update consumers

### 3.3 Consolidate Duplicate Files (2 hours)
- `gamification.ts` vs `gamification-v2.ts` - deprecate v1
- `habits.ts` vs `habit-coaching.ts` - merge or clarify

---

## Priority 4: Code Quality (Ongoing)

### 4.1 Standardize Error Handling
Adopt Result type pattern across all tools:
```typescript
type Result<T, E = Error> = 
  | { success: true; data: T }
  | { success: false; error: E };
```

### 4.2 Replace In-Memory Storage
Files using `Map` for storage:
- `scheduling.ts` - appointments Map
- `tasks.ts` - tasks Map
- `routines.ts` - routines Map

Migrate to Firestore via `productivity-store.js`

### 4.3 Documentation
- Add JSDoc to all public functions
- Document domain usage in manifests
- Create tool development guide

---

## Effort Estimates Summary

| Priority | Task | Effort | Impact |
|----------|------|--------|--------|
| 1.1 | Fix console.logs | 30 mins | High |
| 1.2 | Fix Tool type | 1 hour | High |
| 1.3 | Add core tests | 4 hours | High |
| 2.1 | Split habit-coaching.ts | 8-12 hours | Medium |
| 2.2 | Split scheduling.ts | 4-6 hours | Medium |
| 3.1 | Convert JS to TS | 4 hours | Medium |
| 3.2 | Remove legacy exports | 2 hours | Low |
| 3.3 | Consolidate duplicates | 2 hours | Low |
| 4.x | Code quality | Ongoing | Medium |

**Total Estimated Effort:** 25-35 hours (~1 week focused work)

---

## Success Metrics

After completing this plan:
- [ ] Zero console.log statements in tools/
- [ ] Zero `any` types in tool definitions
- [ ] Test coverage > 50% for core tools
- [ ] No files > 500 lines
- [ ] Zero JS files (all TypeScript)
- [ ] Clear migration status documented

---

## Quick Wins (Do These First)

1. ✅ Fix `music.ts` console.logs (30 mins)
2. Create test template (1 hour)
3. Add tests for `validation.ts` (1 hour)
4. Fix `Tool = any` type (1 hour)

These 4 items can be done in half a day and show immediate progress.

