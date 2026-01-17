# Naming Normalization V2

> **Goal:** Eliminate naming inconsistencies, duplicates, and confusing patterns across the codebase.

## Summary of Issues

| Category | Severity | Count | Status |
|----------|----------|-------|--------|
| Duplicate class names | 🟢 RESOLVED | 25+ | ✅ Analyzed - Not duplicates |
| Suffix convention chaos | 🔴 HIGH | 180+ files | ⏳ Document only |
| Humanization directory fragmentation | 🟢 RESOLVED | 3 dirs | ✅ Intentional architecture |
| Parallel test directories | 🟢 RESOLVED | 2 dirs | ✅ Merged |
| Cryptic abbreviations | 🟢 RESOLVED | 2 files | ✅ Renamed |

---

## Priority 1: Duplicate Class Names ✅ RESOLVED

**Investigation Result:** Most "duplicates" are actually **complementary implementations** in different architectural layers, not true duplicates.

### Analysis

| Class | Status | Finding |
|-------|--------|---------|
| `CelebrationEngine` | ✅ Fixed | Deleted orphan at `services/engagement/celebration-engine.ts` (0 imports) |
| `RateLimiter` | ✅ Not duplicates | **5 implementations serve different purposes:** |
| | | - `utils/rate-limiter.ts` = Generic base class (token bucket) |
| | | - `tools/rate-limiter.ts` = Factory with pre-configured limits per service |
| | | - Domain-specific ones have different semantics |
| `CircuitBreaker` | ✅ Not duplicates | **3 implementations serve different purposes:** |
| | | - `utils/circuit-breaker.ts` = Generic pattern (~25 imports) |
| | | - `tools/execution/circuit-breaker.ts` = Tool execution protection |
| | | - `services/self-healing/circuit-breaker.ts` = Health monitoring |

### Lesson Learned

Same class names in **different architectural layers** are acceptable when they serve distinct purposes. The architecture allows for:
- Generic utilities in `utils/`
- Domain-specific implementations in their respective layers
- Specialized variations for different concerns

---

## Priority 2: Suffix Convention Standardization ✅ DOCUMENTED

**See:** `CLAUDE.md` → "Module Suffix Conventions" section for the authoritative reference.

### Summary

| Suffix | Purpose |
|--------|---------|
| `-service.ts` | Stateless business logic, CRUD, API integrations |
| `-manager.ts` | Stateful resource management, lifecycle |
| `-handler.ts` | Reactive event/request processing |
| `-engine.ts` | Complex algorithms, core domain logic |
| `-executor.ts` | Proactive task/job execution |
| `-orchestrator.ts` | Multi-component coordination |
| `-controller.ts` | **DEPRECATED** - use `-handler.ts` |

### Migration Strategy

- **Document only** - Added to root `CLAUDE.md`
- **No mass-rename** - Too risky with 180+ files
- **Apply to new files** - Enforce on new code only

---

## Priority 3: Humanization Directory Structure ✅ INTENTIONAL

**Investigation Result:** The three directories are the **result** of the January 2026 clean architecture refactoring (documented in `src/conversation/CLAUDE.md`). They are NOT fragmentation - they are intentional separation of concerns.

### Correct Understanding

```
src/conversation/
├── humanization/        # 20+ files - Core engines (disfluency, breathing, etc.)
├── deep-humanization/   # 8 files - Advanced behaviors (mood, generators)
└── humanizer/           # 6 files - Pre/post LLM processors
```

| Directory | Purpose | Import Pattern |
|-----------|---------|----------------|
| `humanization/` | Core humanization engines | Imported by ~60+ files |
| `deep-humanization/` | Advanced behaviors, mood tracking | Imported by 10 files |
| `humanizer/` | LLM pre/post processing facade | Used via conversation orchestrator |

### Why This Is Correct

1. **Single Responsibility**: Each directory has a clear, focused purpose
2. **Clean Dependencies**: `humanizer/` uses engines from `humanization/`
3. **Documented Architecture**: See `src/conversation/CLAUDE.md` for full explanation
4. **Result of Refactoring**: The old monolithic `humanizer.ts` (1,292 lines) was intentionally split

### No Action Required

The structure is correct. The similar names (`humanization`, `humanizer`, `deep-humanization`) might seem confusing, but they represent different concerns in the humanization domain.

---

## Priority 4: Test Directory Consolidation 🟠 MEDIUM

### Current State

```
src/tests/
├── integration/     # 7 test files
└── integrations/    # 7 test files (plural - inconsistent)
```

### Resolution

Merge into single `integration/` directory:

```bash
git mv src/tests/integration/* src/tests/integration/
rmdir src/tests/integrations
```

---

## Priority 5: Cryptic Abbreviations 🟡 LOW

### Files to Rename

| Current | Proposed | Reason |
|---------|----------|--------|
| `src/conversation/utils/rng.ts` | `random-generator.ts` | "rng" is cryptic |
| `src/i18n/rtl.ts` | `right-to-left.ts` | "rtl" is an abbreviation |

---

## Implementation Order

| # | Task | Status | Time |
|---|------|--------|------|
| 1 | Cryptic abbreviations | ✅ Done | 5 min |
| 2 | Test directory merge | ✅ Done | 10 min |
| 3 | Duplicate class analysis | ✅ Done (no action needed) | 15 min |
| 4 | Humanization analysis | ✅ Done (no action needed) | 10 min |
| 5 | Suffix conventions | ✅ Done | Documented in CLAUDE.md |

---

## Success Criteria

- [x] `rng.ts` → `random-generator.ts`
- [x] `rtl.ts` → `right-to-left.ts`
- [x] `tests/integrations/` merged into `tests/integration/`
- [x] Deleted orphan `services/engagement/celebration-engine.ts`
- [x] Confirmed RateLimiter/CircuitBreaker are architectural variations, not duplicates
- [x] Confirmed humanization directories are intentional clean architecture
- [x] Suffix conventions documented in root CLAUDE.md

---

*Created: January 2026*
