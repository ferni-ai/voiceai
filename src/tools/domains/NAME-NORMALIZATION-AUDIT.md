# Tool Domains - Name Normalization Audit

**Date:** January 13, 2026  
**Status:** ✅ COMPLETED - All Issues Resolved

---

## Resolution Summary

All naming normalization issues have been resolved:

| Change | Status |
|--------|--------|
| `maya-coaching/` → `habit-intelligence/` | ✅ Done |
| `peter-analytics/` → `pattern-analytics/` | ✅ Done |
| `jordan-planning/` → `event-intelligence/` | ✅ Done |
| `nayan-wisdom/` → `wisdom-intelligence/` | ✅ Done |
| Persona-specific tags → domain-neutral tags | ✅ Done |
| Service file renames | ✅ Done |
| Import updates | ✅ Done |
| Typecheck passing | ✅ Verified |
| Test file renames | ✅ Done |
| Test assertions updated | ✅ Done |
| Service file comments | ✅ Done |
| All domain tests passing | ✅ 46 tests pass |

## Phase 3: Invalid Persona IDs (January 2026)

### Issue
Group conversation/outreach code used invalid persona IDs that weren't in the alias registry.

### Fixed

| Invalid ID | Correct ID | Files Fixed |
|------------|------------|-------------|
| `maya-habits` | `maya-santos` | 15 files |
| `jordan-milestones` | `jordan-taylor` | 3 files |
| `nayan-wisdom` | `nayan-patel` | 5 files |
| `nayan-sharma` | `nayan-patel` | 10 files |
| `alex-comms` | `alex-chen` | 1 file |

### Test IDs Normalized

| Old Test ID | New Test ID |
|-------------|-------------|
| `handoff-nayan-wisdom` | `handoff-nayan` |
| `nayan-wisdom-quote` | `nayan-quote` |

### Verification
- ✅ `pnpm typecheck` - 0 errors
- ✅ No remaining invalid persona IDs in source files

## Phase 4: Memory System Normalization (January 2026)

### Issue
Memory system used legacy aliases in tool API surface and had confusing type definitions.

### Changes Made

#### 1. Tool Schema Updated (`persona-tools.ts`)
Before:
```typescript
.enum(['jack-b', 'nayan-patel', 'peter-john', 'spend-save', 'event-planner', 'comm-specialist'])
.describe('Which persona stored this memory (jack-b=Bogle, nayan-patel=Ferni...)')
```

After:
```typescript
.enum(['ferni', 'peter', 'maya', 'jordan', 'alex', 'nayan'])
.describe('Which team member stored this memory (ferni=coach, peter=researcher...)')
```

#### 2. Added Alias Resolution Layer (`persona-memories.ts`)
New exports:
- `MemoryPersonaId` - Storage key type (internal)
- `CanonicalPersonaName` - User-facing persona names
- `toStorageKey(canonical)` - Convert canonical → storage key
- `toCanonicalName(storageKey)` - Convert storage key → canonical
- `CANONICAL_TO_STORAGE_KEY` - Mapping constant
- `STORAGE_KEY_TO_CANONICAL` - Reverse mapping

#### 3. Storage Keys (Backward Compatible)
| Storage Key | Field Name | Canonical Name |
|-------------|------------|----------------|
| `jack-b` | `jackie` | `ferni` |
| `peter-john` | `peter` | `peter` |
| `spend-save` | `maya` | `maya` |
| `event-planner` | `jordan` | `jordan` |
| `comm-specialist` | `alex` | `alex` |
| `nayan-patel` | `bogle` | `nayan` |

Note: Storage keys and Firestore field names are preserved for backward compatibility with existing user data.

### Verification
- ✅ `pnpm typecheck` - 0 errors
- ✅ Memory tests - 55 tests passing
- ✅ Tool API now uses user-friendly names
- ✅ Existing data remains accessible via alias resolution

---

## Executive Summary

This audit identifies naming violations in tool domains that contradict the established coding standards in `.cursorrules` and `CLAUDE.md`. The primary issue is **persona-specific domain names** that should be named by domain function instead.

### Key Violations

| Issue Type | Count | Severity |
|------------|-------|----------|
| Persona-specific domain names | 4 | 🔴 Critical |
| Persona-specific tags | 31 | 🟡 Medium |
| Duplicate/overlapping domains | 3 pairs | 🟡 Medium |

---

## 1. Persona-Specific Domain Names (CRITICAL)

### Rule Violation

From `.cursorrules`:
```
### 1. Name by Domain (Not Persona)

habit-coaching.ts     # ✅ Correct - domain name
maya-habit-coach.ts   # ❌ Wrong - persona-specific
```

### Violations Found

| Current Name | Domain Value | Should Be | Rationale |
|--------------|--------------|-----------|-----------|
| `maya-coaching/` | `maya-coaching` | `habit-intelligence/` or `habit-analytics/` | Tools provide superhuman habit analysis |
| `peter-analytics/` | `peter-analytics` | `pattern-analytics/` or `data-analytics/` | Tools provide cross-domain pattern recognition |
| `nayan-wisdom/` | `nayan-wisdom` | Merge into `wisdom/` | Duplicate domain - just adds superhuman capabilities |
| `jordan-planning/` | `jordan-planning` | `event-intelligence/` or `celebration-planning/` | Tools provide event planning intelligence |

### Why This Matters

1. **Violates DRY principle** - Persona logic should live in persona bundles, not tools
2. **Creates coupling** - Tools become tied to specific personas instead of being reusable
3. **Confuses semantic routing** - "maya-coaching" doesn't describe WHAT it does
4. **Documentation drift** - These domains aren't in `DOMAIN_METADATA` (intentionally hidden?)

---

## 2. Persona-Specific Tags (MEDIUM)

### Violations Found (31 total)

```
jordan-specialty (8 occurrences)
maya-specialty (8 occurrences)
peter-specialty (7 occurrences)
nayan-specialty (6 occurrences)
alex-specialty (1 occurrence)
ferni-specialty (1 occurrence)
```

### Files Affected

| File | Tag Count |
|------|-----------|
| `jordan-planning/index.ts` | 8 |
| `maya-coaching/index.ts` | 8 |
| `peter-analytics/index.ts` | 7 |
| `nayan-wisdom/index.ts` | 6 |
| `communication/index.ts` | 1 |
| `proactive/index.ts` | 1 |

### Recommended Replacement

| Current | Suggested |
|---------|-----------|
| `maya-specialty` | `superhuman-habits` or `habit-intelligence` |
| `peter-specialty` | `superhuman-analytics` or `pattern-intelligence` |
| `nayan-specialty` | `superhuman-wisdom` or `wisdom-intelligence` |
| `jordan-specialty` | `superhuman-planning` or `event-intelligence` |
| `alex-specialty` | `superhuman-communication` or `comm-intelligence` |
| `ferni-specialty` | `superhuman-coaching` or `proactive-intelligence` |

---

## 3. Duplicate/Overlapping Domains (MEDIUM)

### Domain Pairs with Overlap

| Domain A | Domain B | Overlap Description |
|----------|----------|---------------------|
| `habits/` | `maya-coaching/` | Both deal with habit tracking and coaching |
| `wisdom/` | `nayan-wisdom/` | Both deal with quotes, principles, perspective |
| `life-planning/` | `jordan-planning/` | Both deal with events and milestones |

### Consolidation Recommendation

1. **`wisdom/` + `nayan-wisdom/`**
   - Merge into single `wisdom/` domain
   - Add superhuman capabilities to existing tools
   - No folder rename needed

2. **`habits/` + `maya-coaching/`**
   - Keep `habits/` for basic CRUD operations
   - Rename `maya-coaching/` → `habit-intelligence/` for advanced analysis
   - Clear separation: habits (actions) vs habit-intelligence (insights)

3. **`life-planning/` + `jordan-planning/`**
   - Keep `life-planning/` for goals and milestones
   - Rename `jordan-planning/` → `event-intelligence/` for superhuman event planning
   - Clear separation: planning (actions) vs event-intelligence (insights)

---

## 4. Service File Coupling

The persona-specific domains import from persona-specific services:

```typescript
// maya-coaching/index.ts
import { ... } from '../../../services/superhuman/maya-coaching-services.js';

// peter-analytics/index.ts
import { ... } from '../../../services/superhuman/peter-analytics-services.js';

// nayan-wisdom/index.ts
import { ... } from '../../../services/superhuman/nayan-wisdom-services.js';

// jordan-planning/index.ts
import { ... } from '../../../services/superhuman/jordan-planning-services.js';
```

### Recommendation

When renaming domains, also rename the corresponding service files:

| Current Service | Suggested Service |
|-----------------|-------------------|
| `maya-coaching-services.js` | `habit-intelligence-services.js` |
| `peter-analytics-services.js` | `pattern-analytics-services.js` |
| `nayan-wisdom-services.js` | `wisdom-services.js` (merge) |
| `jordan-planning-services.js` | `event-intelligence-services.js` |

---

## 5. Migration Plan

### Phase 1: Tags (Low Risk)
1. Replace all `*-specialty` tags with domain-neutral equivalents
2. Run tests to ensure no breakage

### Phase 2: Domain Names (Medium Risk)
1. Create new domain folders with correct names
2. Move tool definitions (keep IDs unchanged)
3. Update `createDomainExport()` calls
4. Update imports in `domains/index.ts`
5. Run full test suite

### Phase 3: Service Consolidation (Higher Risk)
1. Rename service files
2. Update all imports
3. Consider backward compatibility period with re-exports

### Phase 4: Documentation
1. Add new domains to `DOMAIN_METADATA`
2. Update `CLAUDE.md` tool domain tables
3. Update any architecture docs referencing old names

---

## 6. Files to Modify

### Domains to Rename

```
src/tools/domains/maya-coaching/     → src/tools/domains/habit-intelligence/
src/tools/domains/peter-analytics/   → src/tools/domains/pattern-analytics/
src/tools/domains/nayan-wisdom/      → (merge into wisdom/)
src/tools/domains/jordan-planning/   → src/tools/domains/event-intelligence/
```

### Services to Rename

```
src/services/superhuman/maya-coaching-services.js    → habit-intelligence-services.js
src/services/superhuman/peter-analytics-services.js  → pattern-analytics-services.js
src/services/superhuman/nayan-wisdom-services.js     → wisdom-services.js (merge)
src/services/superhuman/jordan-planning-services.js  → event-intelligence-services.js
```

### Index Updates Required

```
src/tools/domains/index.ts           - Update imports
src/services/superhuman/index.ts     - Update exports (if exists)
```

---

## 7. Tool IDs - No Changes Needed

Tool IDs follow correct camelCase convention:
- ✅ `trackHabitDNA`
- ✅ `mapFriction`
- ✅ `revealBlindSpot`
- ✅ `holdParadox`
- ✅ `recallEventPatterns`

**Do NOT change tool IDs** - they may be referenced in:
- Function calling prompts
- Tool execution logs
- User-facing commands
- Analytics/metrics

---

## 8. Acceptable Persona-Adjacent Names

The following are acceptable because they reference roles, not persona names:

| Domain | Why Acceptable |
|--------|----------------|
| `ceo-coaching/` | "CEO" is a user role, not a persona |
| `coaching-support/` | Generic coaching domain |

---

## Appendix: Full Tag Audit

### Tags by Frequency

```
habits          - 16 occurrences (domain tag, OK)
patterns        - 12 occurrences (domain tag, OK)
wisdom          - 11 occurrences (domain tag, OK)
memory          - 8 occurrences (domain tag, OK)
decisions       - 4 occurrences (domain tag, OK)
background      - 4 occurrences (feature tag, OK)
async           - 4 occurrences (feature tag, OK)
while-you-were-away - 4 occurrences (feature tag, OK)

# PERSONA-SPECIFIC (should normalize)
jordan-specialty - 8 occurrences
maya-specialty   - 8 occurrences
peter-specialty  - 7 occurrences
nayan-specialty  - 6 occurrences
alex-specialty   - 1 occurrence
ferni-specialty  - 1 occurrence
```

---

## Decision Required

**Recommendation:** Implement Phase 1 (tags) immediately, then prioritize Phase 2 (domain names) for the next refactoring sprint.

**Risk Assessment:**
- Tag changes: Very low risk (tags are primarily for search/filtering)
- Domain renames: Medium risk (need thorough testing)
- Service renames: Higher risk (may affect runtime)

**Owner:** TBD  
**Target Date:** TBD
