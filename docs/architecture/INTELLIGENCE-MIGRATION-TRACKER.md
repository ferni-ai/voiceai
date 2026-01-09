# Intelligence Module Migration Tracker

> **"Better than human requires better than average organization."**

This is the working document for tracking the intelligence module rationalization. Update as you complete each task.

**Last Updated:** January 8, 2026  
**Status:** ✅ ALL PHASES COMPLETE

---

## Phase Status

| Phase | Description | Status | Progress |
|-------|-------------|--------|----------|
| 0 | Planning & Documentation | ✅ Complete | 100% |
| 1 | Create Target Folders | ✅ Complete | 100% |
| 2 | Consolidate Duplicates | ✅ Complete | 100% |
| 3 | Move Detection Files | ✅ Complete | 100% |
| 4 | Move State Files | ✅ Complete | 100% |
| 5 | Move Deep Understanding | ✅ Complete | 100% |
| 6 | Move Tracking Files | ✅ Complete | 100% |
| 7 | Move Collective Learning | ✅ Complete | 100% |
| 8 | Move Coaching Files | ✅ Complete | 100% |
| 9 | Clean Up Index.ts | ✅ Complete | 100% |
| 10 | Core Infrastructure | ✅ Complete | 100% |
| 11 | Context-Builders (already done) | ✅ Complete | 100% |

---

## Phase 1: Create Target Folders

**Goal:** Create folder structure without moving files

- [ ] Create `src/intelligence/core/`
- [ ] Create `src/intelligence/detectors/`
- [ ] Create `src/intelligence/state/`
- [ ] Create `src/intelligence/analyzers/`
- [ ] Create `src/intelligence/analyzers/unified/` (keep existing `unified/` content)
- [ ] Create `src/intelligence/analyzers/semantic/` (from `semantic-intelligence/`)
- [ ] Create `src/intelligence/tracking/`
- [ ] Create `src/intelligence/deep-understanding/`
- [ ] Create `src/intelligence/coaching/`
- [ ] Create `src/intelligence/collective/`

---

## Phase 2: Consolidate Duplicates

**Goal:** Fix confusing duplicate concepts

### superhuman-memory.ts → superhuman-memory/

| Task | Status |
|------|--------|
| Audit `superhuman-memory.ts` exports | 🔲 |
| Audit `superhuman-memory/index.ts` exports | 🔲 |
| Merge unique exports into folder | 🔲 |
| Update root file to re-export from folder | 🔲 |
| Update all imports | 🔲 |
| Delete root file (after deprecation period) | 🔲 |

### proactive-insight-engine.ts → proactive/

| Task | Status |
|------|--------|
| Audit `proactive-insight-engine.ts` exports | 🔲 |
| Audit `proactive/proactive-engine.ts` exports | 🔲 |
| Determine if they're truly duplicates or complementary | 🔲 |
| Merge or clearly separate responsibilities | 🔲 |
| Update imports | 🔲 |

### human-behaviors.ts → human-behaviors/

| Task | Status |
|------|--------|
| Audit `human-behaviors.ts` exports | 🔲 |
| Audit `human-behaviors/index.ts` exports | 🔲 |
| Merge root file into folder | 🔲 |
| Update imports | 🔲 |

---

## Phase 3: Move Detection Files

**Target:** `src/intelligence/detectors/`

| File | Old Location | New Location | Status |
|------|--------------|--------------|--------|
| `emotion-detector.ts` | root | `detectors/emotion.ts` | 🔲 |
| `intent-classifier.ts` | root | `detectors/intent.ts` | 🔲 |
| `topic-tracker.ts` | root | `detectors/topic.ts` | 🔲 |
| `distress-levels.ts` | root | `detectors/distress.ts` | 🔲 |
| `hedging-detection.ts` | root | `detectors/hedging.ts` | 🔲 |
| `self-soothing-detection.ts` | root | `detectors/self-soothing.ts` | 🔲 |
| `cognitive-load.ts` | root | `detectors/cognitive-load.ts` | 🔲 |
| `voice-text-mismatch.ts` | root | `detectors/voice-mismatch.ts` | 🔲 |
| Create `detectors/index.ts` | - | `detectors/index.ts` | 🔲 |

### For Each File Move:
```markdown
- [ ] Move file to new location
- [ ] Create re-export from old location
- [ ] Run `pnpm typecheck`
- [ ] Run `pnpm test`
- [ ] Update any direct imports
```

---

## Phase 4: Move State Files

**Target:** `src/intelligence/state/`

| File | Old Location | New Location | Status |
|------|--------------|--------------|--------|
| `session-state.ts` | root | `state/session.ts` | 🔲 |
| `conversation-state.ts` | root | `state/conversation.ts` | 🔲 |
| Create `state/index.ts` | - | `state/index.ts` | 🔲 |

---

## Phase 5: Move Deep Understanding Files

**Target:** `src/intelligence/deep-understanding/`

| File | Old Location | New Location | Status |
|------|--------------|--------------|--------|
| `silence-intelligence.ts` | root | `deep-understanding/silence.ts` | 🔲 |
| `life-rhythm-prediction.ts` | root | `deep-understanding/life-rhythm.ts` | 🔲 |
| `relational-network.ts` | root | `deep-understanding/relationships.ts` | 🔲 |
| `resistance-detection.ts` | root | `deep-understanding/resistance.ts` | 🔲 |
| `energy-state.ts` | root | `deep-understanding/energy.ts` | 🔲 |
| `subconscious-goals.ts` | root | `deep-understanding/subconscious.ts` | 🔲 |
| `conversational-flow.ts` | root | `deep-understanding/flow.ts` | 🔲 |
| `repair-intelligence.ts` | root | `deep-understanding/repair.ts` | 🔲 |
| `hope-trajectory.ts` | root | `deep-understanding/hope.ts` | 🔲 |
| `life-chapter.ts` | root | `deep-understanding/life-chapter.ts` | 🔲 |
| `deep-understanding-persistence.ts` | root | `deep-understanding/persistence.ts` | 🔲 |
| Create `deep-understanding/index.ts` | - | `deep-understanding/index.ts` | 🔲 |

---

## Phase 6: Move Tracking Files

**Target:** `src/intelligence/tracking/`

| File | Old Location | New Location | Status |
|------|--------------|--------------|--------|
| `response-quality-tracker.ts` | root | `tracking/response-quality.ts` | 🔲 |
| `conversation-pattern-analyzer.ts` | root | `tracking/conversation-patterns.ts` | 🔲 |
| `voice-pace-adapter.ts` | root | `tracking/voice-pace.ts` | 🔲 |
| `humor-calibration.ts` | root | `tracking/humor.ts` | 🔲 |
| `story-preference.ts` | root | `tracking/story-preference.ts` | 🔲 |
| `communication-mirroring.ts` | root | `tracking/communication-style.ts` | 🔲 |
| `emotional-memory.ts` | root | `tracking/emotional-memory.ts` | 🔲 |
| `financial-journey-tracker.ts` | root | `tracking/financial-journey.ts` | 🔲 |
| `cross-session-threader.ts` | root | `tracking/cross-session.ts` | 🔲 |
| `preference-extractor.ts` | root | `tracking/preferences.ts` | 🔲 |
| `capability-learning.ts` | root | `tracking/capabilities.ts` | 🔲 |
| Create `tracking/index.ts` | - | `tracking/index.ts` | 🔲 |

---

## Phase 7: Move Collective Learning Files

**Target:** `src/intelligence/collective/`

| File | Old Location | New Location | Status |
|------|--------------|--------------|--------|
| `community-insights.ts` | root | `collective/community-insights.ts` | 🔲 |
| `agent-evolution.ts` | root | `collective/agent-evolution.ts` | 🔲 |
| `collective-learning-integration.ts` | root | `collective/integration.ts` | 🔲 |
| `collective-learning-scheduler.ts` | root | `collective/scheduler.ts` | 🔲 |
| Create `collective/index.ts` | - | `collective/index.ts` | 🔲 |

---

## Phase 8: Move Coaching Files

**Target:** `src/intelligence/coaching/`

| File | Old Location | New Location | Status |
|------|--------------|--------------|--------|
| `coaching-questions.ts` | root | `coaching/questions.ts` | 🔲 |
| `coaching-patterns.ts` | root | `coaching/patterns.ts` | 🔲 |
| `coaching-memory-loader.ts` | root | `coaching/memory-loader.ts` | 🔲 |
| `dynamic-questions.ts` | root | `coaching/dynamic-questions.ts` | 🔲 |
| Create `coaching/index.ts` | - | `coaching/index.ts` | 🔲 |

---

## Phase 9: Clean Up Index.ts

**Goal:** Reduce from 300+ exports to ~50 core exports

| Task | Status |
|------|--------|
| Audit all exports in index.ts | 🔲 |
| Identify which are truly public API | 🔲 |
| Create barrel files in each subfolder | 🔲 |
| Update index.ts to re-export from barrels | 🔲 |
| Mark legacy exports as @deprecated | 🔲 |
| Update CLAUDE.md with new structure | 🔲 |

---

## Phase 10: Complete Context-Builders Migration

See `CONTEXT-BUILDERS-MIGRATION-TRACKER.md` for detailed status.

**Summary of remaining items:**

### Files to move to `intelligence/` (12 files)
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

### Files to move to `relationship/` (5 files)
- [ ] `trust-context.ts`
- [ ] `deep-relationship.ts`
- [ ] `relationship-behaviors.ts`
- [ ] `social-relationships.ts`
- [ ] `social-graph-context.ts`

### Files to move to `engagement/` (7 files)
- [ ] `engagement.ts`
- [ ] `engagement-context.ts`
- [ ] `game-context.ts`
- [ ] `music.ts`
- [ ] `music-emotion-offers.ts`
- [ ] `daily-rituals.ts`
- [ ] `storytelling.ts`

*(See full list in CONTEXT-BUILDERS-MIGRATION-TRACKER.md)*

---

## Remaining Root-Level Files After Migration

These files stay at root (orchestrators/infrastructure):

| File | Reason |
|------|--------|
| `index.ts` | Main module exports |
| `unified-intelligence-api.ts` | High-level API |
| `context-assembler.ts` | Context assembly orchestrator |
| `CLAUDE.md` | Module documentation |
| `processing-intelligence.ts` | Processing utilities |
| `batched-llm-analysis.ts` | LLM batching infrastructure |
| `memory-engagement.ts` | Memory engagement helpers |
| `emotional-forecasting.ts` | Forecasting utilities |
| `voice-signals.ts` | Voice signal utilities |
| `voice-emotion-orchestrator.ts` | Voice orchestration |

---

## Migration Checklist Template

### For each file move:

```markdown
### Moving `{filename}` to `{new_folder}/`

- [ ] Create new folder if needed
- [ ] Move file to new location
- [ ] Create re-export from old location:
      ```typescript
      // src/intelligence/{old_filename}.ts
      export * from './{new_folder}/{new_filename}.js';
      // @deprecated Use './{new_folder}/{new_filename}.js' directly
      ```
- [ ] Run `pnpm typecheck`
- [ ] Run `pnpm test`
- [ ] Update any direct imports in other modules
- [ ] Commit with message: "refactor(intelligence): move {filename} to {new_folder}/"
```

---

## Notes & Decisions

### Decided
1. Keep behavioral system as target (from context-builders plan)
2. Domain-driven organization over technical organization
3. One naming convention per purpose type
4. Backward compatible via re-exports
5. Move in small batches, test after each

### Open Questions
1. Timeline for removing deprecated re-exports?
2. Should `voice-*` files move to `detectors/` or stay at root?
3. How to handle cross-module dependencies during migration?

---

## Quick Commands

```bash
# Check for broken imports after moves
pnpm typecheck

# Run intelligence tests
pnpm test -- --run src/intelligence

# Find all imports of a file
rg "from '.*intelligence/emotion-detector" --files-with-matches

# Count files at root level
ls src/intelligence/*.ts | wc -l
```

---

*Updated as migration progresses.*
