# Entity Store Type Fix Plan

## Executive Summary

**Current State:** 222 TypeScript errors across memory/knowledge-graph and intelligence modules
**Root Cause:** Type unification in progress - entity-store is now the single source of truth, but consuming code hasn't been updated
**Estimated Effort:** 3-4 hours total across 6 phases

---

## Error Breakdown

### By Error Type (222 total)

| Code | Count | Description | Fix Strategy |
|------|-------|-------------|--------------|
| TS2339 | 117 | Property doesn't exist on type | Add missing properties OR update code to use correct property names |
| TS2305 | 18 | Module has no exported member | Add missing exports to types.ts |
| TS2345 | 16 | Argument type mismatch | Fix type signatures or add adapters |
| TS2322 | 16 | Type not assignable | Fix type definitions or use type assertions |
| TS7006 | 10 | Implicit 'any' type | Add explicit type annotations |
| TS2551 | 7 | Property typo (did you mean?) | Fix property name typos |
| TS2353 | 7 | Unknown property in object literal | Update object shapes to match types |
| TS2484 | 5 | Export declaration conflicts | Remove duplicate exports |
| TS2304 | 4 | Cannot find name | Add missing imports |
| Other | 22 | Various | Case-by-case fixes |

### By File (Top 15)

| File | Errors | Category |
|------|--------|----------|
| `integration.ts` (knowledge-graph) | 25 | API Mismatch |
| `deep-consolidation.ts` | 15 | Entity Type |
| `emotional-memory-map.ts` | 12 | Entity Type |
| `contradiction-detector.ts` | 12 | Entity Type |
| `advanced-correlation.ts` | 12 | Entity Type |
| `natural-language-query.ts` | 11 | Entity Type |
| `telephony-integration.ts` | 10 | Entity Type |
| `proactive-surfacing.ts` | 10 | Entity Type |
| `superhuman-capabilities.test.ts` | 7 | Test Fixtures |
| `entity-embeddings.ts` | 6 | Entity Type |
| `anniversary-engine.ts` | 6 | Entity Type |
| `embedding-persistence.ts` | 6 | Predictive Types |
| `predictive-memory.ts` | 5 | Entity Type |
| `thread-store.ts` | 5 | Entity Type |
| `index.ts` (knowledge-graph) | 5 | Export Issues |

---

## Phase 1: Fix Missing Exports (18 errors)
**Time:** 15-20 minutes
**Files:** `entity-store/types.ts`, `knowledge-graph/types.ts`

### Tasks
1. Add missing exports to `entity-store/types.ts`:
   - [ ] `EntityRelationship` with `label` and `relationshipType` fields
   - [ ] `ExtractedFact` with `entityId` and `entityName` fields
   - [ ] Ensure `CaptureResult` has `id`, `canonicalName`, `attributes`

2. Add missing re-exports to `knowledge-graph/types.ts`:
   - [ ] `EntityRelationship`
   - [ ] `ExtractedRelationship` with proper fields

3. Fix export conflicts (TS2484):
   - [ ] Check for duplicate exports in `knowledge-graph/index.ts`
   - [ ] Remove conflicting re-exports

---

## Phase 2: Fix KnowledgeGraph API (25 errors)
**Time:** 30-45 minutes
**File:** `memory/knowledge-graph/integration.ts`

### Root Cause
`integration.ts` calls methods that don't exist on `KnowledgeGraph` facade:
- `graph.resolveMention()` - doesn't exist
- `graph.addFact()` - doesn't exist
- `graph.recordMention()` - doesn't exist

### Options
**Option A (Recommended):** Add stub methods to KnowledgeGraph facade
```typescript
// In index.ts, extend knowledgeGraphInstance
knowledgeGraphInstance = {
  ...existing,
  resolveMention: (userId, mention) => entityResolver.resolveMention(userId, mention),
  addFact: (userId, entityId, fact) => entityResolver.addFact(userId, entityId, fact),
  recordMention: (userId, entityId, mention) => entityResolver.recordMention(userId, entityId, mention),
};
```

**Option B:** Update integration.ts to use entityResolver directly
```typescript
const { entityResolver } = getKnowledgeGraph();
await entityResolver.resolveMention(...);
```

### Tasks
1. [ ] Choose Option A or B
2. [ ] Implement chosen approach
3. [ ] Fix `TemporalMention` usage (has `context`, not `text`)

---

## Phase 3: Fix Entity Type Mismatches (~80 errors)
**Time:** 45-60 minutes
**Files:** All `memory/knowledge-graph/superhuman/*.ts`

### Root Cause
Code expects old Entity fields, but entity-store Entity has different names:

| Old Field | New Field | Notes |
|-----------|-----------|-------|
| `firstMentioned` | `firstSeen` | Both now available (alias) |
| `lastMentioned` | `lastSeen` | Both now available (alias) |
| `emotionalSalience` | `emotionalWeight` | Both now available (alias) |
| `importance` | `salienceScore` | Both now available (alias) |
| `properties` | `attributes` | Both now available (alias) |

Since we added compatibility aliases, most of these should already work.

### Remaining Issues
1. **Type narrowing needed:** Some code accesses properties directly without checking
2. **EntityRelationship differences:** Missing `label`, `relationshipType` fields

### Tasks
1. [ ] Add `label?: string` to EntityRelationship in entity-store/types.ts
2. [ ] Add `relationshipType?: EdgeType` alias for `type` in EntityRelationship
3. [ ] Run typecheck, fix remaining entity field access errors

---

## Phase 4: Fix Predictive Module (~30 errors)
**Time:** 30-45 minutes
**Files:** `intelligence/predictive/**/*.ts`

### Issues
1. **Missing type annotations** (TS7006): Add explicit types to function parameters
2. **Type mismatches** (TS2345/TS2322): Align function signatures
3. **Duplicate identifier errors** (TS2300): Remove duplicate type declarations

### Tasks
1. [ ] Fix `embeddings/embedding-persistence.ts` (6 errors)
2. [ ] Fix `embeddings/entity-embedding-sync.ts` (3 errors)
3. [ ] Fix `signal-integration.ts` (2 errors)
4. [ ] Fix `index.ts` (2 errors) - duplicate exports
5. [ ] Fix `intervention-timing.ts`, `breakthrough-embeddings.ts`, etc. (1 each)

---

## Phase 5: Fix Test Files (~12 errors)
**Time:** 15-20 minutes
**Files:** `__tests__/*.test.ts`

### Tasks
1. [ ] Update test fixtures to match new Entity shape
2. [ ] Fix `entity-store.test.ts` (5 errors):
   - `CaptureResult` property access
   - Test type assertions
3. [ ] Fix `superhuman-capabilities.test.ts` (7 errors):
   - Update mock data
   - Fix type imports
4. [ ] Fix `embedding-capabilities.test.ts` (4 errors)
5. [ ] Fix `knowledge-graph-e2e.test.ts` (1 error)

---

## Phase 6: Fix Remaining (~20 errors)
**Time:** 20-30 minutes
**Files:** Various

### Tasks
1. [ ] `memory/orchestrator.ts` (3 errors) - Type imports
2. [ ] `memory/index.ts` (1 error) - Missing export
3. [ ] `intelligence/unified-intelligence-api.ts` (1 error)
4. [ ] `knowledge-graph-context.ts` (4 errors) - EntityRelationship fields
5. [ ] Other scattered errors

---

## Execution Order

```
Phase 1 (Exports)        ──┐
                           ├──> Phase 3 (Entity Types)
Phase 2 (API Stubs)      ──┘
                                      │
                                      ▼
                              Phase 4 (Predictive)
                                      │
                                      ▼
                              Phase 5 (Tests)
                                      │
                                      ▼
                              Phase 6 (Cleanup)
                                      │
                                      ▼
                               Final Typecheck
```

---

## Verification Commands

```bash
# Check error count
pnpm typecheck 2>&1 | grep "error TS" | wc -l

# Check specific file
pnpm typecheck 2>&1 | grep "filename.ts"

# Run full quality check after completion
pnpm quality
```

---

## Risk Mitigation

1. **Commit after each phase** - Use `git commit --no-verify -m "Phase X: description"`
2. **Track error count** - Should decrease after each phase
3. **Don't break existing functionality** - The compatibility aliases maintain backward compat
4. **Test critical paths** - After completion, manually test voice agent startup

---

## Definition of Done

- [ ] `pnpm typecheck` passes with 0 errors
- [ ] `pnpm lint` passes
- [ ] Voice agent starts successfully
- [ ] Unit tests pass (`pnpm test`)
- [ ] Changes committed with clear commit messages

---

## Notes

### Why This Happened
The entity-store and knowledge-graph modules evolved separately with incompatible types. This refactoring unifies them with entity-store as the canonical source.

### Long-term Benefits
1. **Single source of truth** - Entity type defined once
2. **Better IntelliSense** - Consistent autocomplete
3. **Easier maintenance** - One place to update
4. **Clearer architecture** - knowledge-graph depends on entity-store, not vice versa
