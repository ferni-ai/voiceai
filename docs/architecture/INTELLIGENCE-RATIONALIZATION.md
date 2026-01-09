# Intelligence Module Rationalization

> **"Intelligence is not about having data. It's about knowing what matters right now."**

This document provides a comprehensive plan to rationalize the 464-file `src/intelligence/` module into a clean, discoverable, maintainable architecture.

**Status:** 📋 Planning | **Created:** January 2026

---

## Executive Summary

### The Problem

| Issue | Current State | Impact |
|-------|--------------|--------|
| **File sprawl** | 464 TypeScript files | Hard to find what you need |
| **Export explosion** | 300+ symbols from index.ts | Import confusion |
| **Duplicate concepts** | 5+ "unified" systems | Which one to use? |
| **Inconsistent organization** | Some folders organized, root is chaos | Onboarding nightmare |
| **Overlapping responsibilities** | `superhuman-memory.ts` AND `superhuman-memory/` | Unclear boundaries |

### The Goal

A clean, layered architecture where:
1. **New developers** can find relevant code in minutes, not hours
2. **Each folder** has ONE clear responsibility
3. **The index.ts** exports a clean public API (~50 symbols, not 300)
4. **Duplicate concepts** are consolidated into single implementations

---

## Current State Audit

### File Distribution (464 files)

| Location | Files | Status |
|----------|-------|--------|
| `context-builders/` | 220 | ⚠️ Has rationalization plan, partially executed |
| `predictive/` | 33 | ✅ Well-organized |
| `triggers/` | 41 | ✅ Has CLAUDE.md, well-documented |
| `user-learning-engine/` | 13 | ✅ Cohesive |
| `superhuman-memory/` | 10 | ⚠️ Conflicts with root file |
| `semantic-intelligence/` | 12 | ⚠️ Overlaps with `unified/` |
| `unified/` | 6 | ⚠️ Should be THE unified system |
| `conversation-quality/` | 9 | ✅ Cohesive |
| `human-behaviors/` | 10 | ✅ Cohesive |
| `data-capture/` | 15 | ✅ Well-organized |
| `proactive/` | 3 | ⚠️ Conflicts with root file |
| `patterns/` | 2 | ⚠️ Underutilized |
| `utils/` | 6 | ✅ Utility helpers |
| `__tests__/` | 6 | ✅ Tests |
| **Root level** | ~78 | ❌ Chaos - needs organization |

### Root-Level Files Audit (78 files)

These files sit at `src/intelligence/` root and need organization:

#### Detection/Analysis (move to `detectors/`)
```
emotion-detector.ts          # Emotion detection
intent-classifier.ts         # Intent classification  
topic-tracker.ts             # Topic extraction
hedging-detection.ts         # Hedging language
self-soothing-detection.ts   # Self-soothing patterns
cognitive-load.ts            # Cognitive load detection
voice-text-mismatch.ts       # Voice/text mismatch
distress-levels.ts           # Distress thresholds
```

#### State Management (move to `state/`)
```
session-state.ts             # Session state manager
conversation-state.ts        # Conversation state machine
```

#### Tracking/Learning (move to `tracking/`)
```
response-quality-tracker.ts       # Response effectiveness
conversation-pattern-analyzer.ts  # User conversation patterns
voice-pace-adapter.ts             # Voice pace learning
humor-calibration.ts              # Humor preference learning
story-preference.ts               # Story preference learning
communication-mirroring.ts        # Communication style learning
emotional-memory.ts               # Emotional continuity
financial-journey-tracker.ts      # Financial progress
cross-session-threader.ts         # Topic threading
preference-extractor.ts           # Preference extraction
capability-learning.ts            # Capability learning
```

#### Deep Understanding (move to `deep-understanding/`)
```
silence-intelligence.ts      # Silence interpretation
life-rhythm-prediction.ts    # Life rhythm patterns
relational-network.ts        # People in their life
resistance-detection.ts      # What they're avoiding
energy-state.ts              # Energy/capacity
subconscious-goals.ts        # Unarticulated goals
conversational-flow.ts       # Depth optimization
repair-intelligence.ts       # Misunderstanding repair
hope-trajectory.ts           # Resilience tracking
life-chapter.ts              # Life phase awareness
deep-understanding-persistence.ts  # Persistence layer
```

#### Coaching (move to `coaching/`)
```
coaching-questions.ts        # Question generation
coaching-patterns.ts         # Pattern tracking
coaching-memory-loader.ts    # Memory for coaching
dynamic-questions.ts         # Dynamic question generation
```

#### Proactive (merge into `proactive/`)
```
proactive-insight-engine.ts  # DUPLICATE - merge with proactive/
```

#### Superhuman Memory (merge into `superhuman-memory/`)
```
superhuman-memory.ts         # DUPLICATE - merge with superhuman-memory/
```

#### Collective Learning (move to `collective/`)
```
community-insights.ts              # Community patterns
agent-evolution.ts                 # Self-improvement
collective-learning-integration.ts # Integration layer
collective-learning-scheduler.ts   # Background jobs
```

#### Voice Analysis (merge into `unified/`)
```
voice-signals.ts                   # Voice signal analysis
voice-emotion-orchestrator.ts      # Voice emotion coordination
```

#### Orchestrators/APIs (keep at root or move to `api/`)
```
index.ts                           # Main exports
unified-intelligence-api.ts        # Unified API
context-assembler.ts               # Context assembly
```

#### Human Behaviors (already has folder)
```
human-behaviors.ts                 # DUPLICATE - merge with human-behaviors/
```

#### Miscellaneous
```
processing-intelligence.ts         # Processing helpers
batched-llm-analysis.ts            # LLM batching
memory-engagement.ts               # Memory engagement
emotional-forecasting.ts           # Emotion forecasting
```

---

## Target Architecture

### Vision: Layered Intelligence Stack

```
src/intelligence/
│
├── index.ts                 # Clean public API (~50 exports)
├── CLAUDE.md                # Module documentation
│
├── core/                    # L0: Foundation (types, shared utilities)
│   ├── types.ts             # Core type definitions
│   ├── constants.ts         # Shared constants
│   └── utils.ts             # Shared utilities
│
├── detectors/               # L1: Pure Detection (no state, no side effects)
│   ├── emotion.ts           # Emotion detection
│   ├── intent.ts            # Intent classification
│   ├── topic.ts             # Topic extraction
│   ├── distress.ts          # Distress level detection
│   ├── hedging.ts           # Hedging language
│   ├── self-soothing.ts     # Self-soothing patterns
│   ├── cognitive-load.ts    # Cognitive load
│   ├── voice-mismatch.ts    # Voice/text mismatch
│   └── index.ts             # Detector exports
│
├── state/                   # L2: State Management
│   ├── session.ts           # Session state
│   ├── conversation.ts      # Conversation state machine
│   └── index.ts
│
├── analyzers/               # L3: Combined Analysis (uses detectors)
│   ├── unified/             # THE unified analysis system
│   │   ├── analyzer.ts      # Main unified analyzer
│   │   ├── humanization.ts  # Humanization orchestrator
│   │   ├── mismatch.ts      # Mismatch detection
│   │   ├── feedback.ts      # Naturalness feedback
│   │   └── index.ts
│   ├── semantic/            # Semantic intent analysis
│   │   └── ... (from semantic-intelligence/)
│   └── index.ts
│
├── tracking/                # L4: Learning & Tracking (stateful, persistent)
│   ├── response-quality.ts  # Response effectiveness
│   ├── conversation-patterns.ts
│   ├── voice-pace.ts
│   ├── humor.ts
│   ├── story-preference.ts
│   ├── communication-style.ts
│   ├── emotional-memory.ts
│   ├── cross-session.ts
│   └── index.ts
│
├── deep-understanding/      # L5: Superhuman Understanding
│   ├── silence.ts           # Silence interpretation
│   ├── life-rhythm.ts       # Life patterns
│   ├── relationships.ts     # Relational network
│   ├── resistance.ts        # What they avoid
│   ├── energy.ts            # Capacity tracking
│   ├── subconscious.ts      # Unarticulated goals
│   ├── flow.ts              # Conversation depth
│   ├── repair.ts            # Misunderstanding repair
│   ├── hope.ts              # Resilience
│   ├── life-chapter.ts      # Life phase
│   ├── persistence.ts       # Storage
│   └── index.ts
│
├── coaching/                # Domain: Coaching Intelligence
│   ├── questions.ts         # Question generation
│   ├── patterns.ts          # Pattern tracking
│   ├── memory-loader.ts     # Memory for coaching
│   └── index.ts
│
├── proactive/               # Proactive Intelligence (consolidated)
│   ├── engine.ts            # Proactive engine
│   ├── insights.ts          # Insight generation (from root)
│   └── index.ts
│
├── superhuman-memory/       # Superhuman Memory (consolidated)
│   ├── index.ts             # Main entry (merge root file here)
│   ├── comfort-patterns.ts
│   ├── date-awareness.ts
│   ├── delivery-tracking.ts
│   ├── growth-celebration.ts
│   ├── inside-jokes.ts
│   ├── temporal-context.ts
│   ├── topic-absence.ts
│   ├── voice-patterns.ts
│   └── types.ts
│
├── collective/              # Collective Learning (new folder)
│   ├── community-insights.ts
│   ├── agent-evolution.ts
│   ├── integration.ts
│   ├── scheduler.ts
│   └── index.ts
│
├── predictive/              # Predictive Intelligence (keep as-is)
│   └── ... (33 files, well-organized)
│
├── triggers/                # Superhuman Triggers (keep as-is)
│   └── ... (41 files, has CLAUDE.md)
│
├── context-builders/        # Context Builders (follow existing plan)
│   └── ... (220 files, has rationalization plan)
│
├── conversation-quality/    # Keep as-is
├── human-behaviors/         # Keep as-is (merge root file)
├── user-learning-engine/    # Keep as-is
├── data-capture/            # Keep as-is
└── utils/                   # Keep as-is
```

---

## Migration Plan

### Phase 1: Create Target Folders (Day 1)

Create the new folder structure without moving files:

```bash
mkdir -p src/intelligence/{core,detectors,state,analyzers/unified,analyzers/semantic,tracking,deep-understanding,coaching,collective}
```

### Phase 2: Consolidate Duplicates (Week 1)

**Priority: Fix confusing duplicates first**

| Duplicate | Action |
|-----------|--------|
| `superhuman-memory.ts` + `superhuman-memory/` | Merge root into folder's `index.ts` |
| `proactive-insight-engine.ts` + `proactive/` | Merge root into `proactive/insights.ts` |
| `human-behaviors.ts` + `human-behaviors/` | Merge root into folder's `index.ts` |
| `unified/` + `semantic-intelligence/` | Keep both, clarify boundaries |

### Phase 3: Move Detection Files (Week 2)

Move pure detection files to `detectors/`:

```bash
# Create detectors/index.ts with re-exports
# Move files one at a time, update imports
```

Files to move:
- `emotion-detector.ts` → `detectors/emotion.ts`
- `intent-classifier.ts` → `detectors/intent.ts`
- `topic-tracker.ts` → `detectors/topic.ts`
- `distress-levels.ts` → `detectors/distress.ts`
- `hedging-detection.ts` → `detectors/hedging.ts`
- `self-soothing-detection.ts` → `detectors/self-soothing.ts`
- `cognitive-load.ts` → `detectors/cognitive-load.ts`
- `voice-text-mismatch.ts` → `detectors/voice-mismatch.ts`

### Phase 4: Move State Files (Week 2)

Move state management to `state/`:

- `session-state.ts` → `state/session.ts`
- `conversation-state.ts` → `state/conversation.ts`

### Phase 5: Move Deep Understanding (Week 3)

Move to `deep-understanding/`:

- `silence-intelligence.ts` → `deep-understanding/silence.ts`
- `life-rhythm-prediction.ts` → `deep-understanding/life-rhythm.ts`
- ... (11 files total)

### Phase 6: Move Tracking Files (Week 3)

Move to `tracking/`:

- `response-quality-tracker.ts` → `tracking/response-quality.ts`
- `conversation-pattern-analyzer.ts` → `tracking/conversation-patterns.ts`
- ... (11 files total)

### Phase 7: Move Collective Learning (Week 4)

Move to `collective/`:

- `community-insights.ts` → `collective/community-insights.ts`
- `agent-evolution.ts` → `collective/agent-evolution.ts`
- `collective-learning-integration.ts` → `collective/integration.ts`
- `collective-learning-scheduler.ts` → `collective/scheduler.ts`

### Phase 8: Move Coaching Files (Week 4)

Move to `coaching/`:

- `coaching-questions.ts` → `coaching/questions.ts`
- `coaching-patterns.ts` → `coaching/patterns.ts`
- `coaching-memory-loader.ts` → `coaching/memory-loader.ts`
- `dynamic-questions.ts` → `coaching/dynamic-questions.ts`

### Phase 9: Clean Up Index.ts (Week 5)

Refactor `index.ts` to:
1. Export from barrel files in each subfolder
2. Reduce to ~50 core exports
3. Mark legacy exports as deprecated
4. Update CLAUDE.md with new structure

### Phase 10: Execute Context-Builders Migration (Week 5-6)

Complete the unchecked items in `CONTEXT-BUILDERS-MIGRATION-TRACKER.md`

---

## Backward Compatibility Strategy

### Re-export Pattern

Every moved file gets a re-export from the old location:

```typescript
// OLD: src/intelligence/emotion-detector.ts
// AFTER MOVE:

// Re-export for backward compatibility
export * from './detectors/emotion.js';

// TODO: Remove in v2.0 - use './detectors/emotion.js' directly
```

### Import Update Script

Create a codemod to update imports:

```bash
# Find all imports from old location
rg "from '.*intelligence/emotion-detector" --files-with-matches

# Update to new location
# (manual or via jscodeshift)
```

---

## Success Metrics

| Metric | Before | After |
|--------|--------|-------|
| Root-level files | 78 | <15 |
| Index.ts exports | 300+ | ~50 |
| Duplicate concepts | 5+ | 0 |
| New dev onboarding | Hours | Minutes |
| "Where does X live?" questions | Frequent | Rare |

---

## Files That Stay at Root

These files should remain at root level (orchestrators/main APIs):

```
index.ts                     # Main module exports
unified-intelligence-api.ts  # High-level API
context-assembler.ts         # Context assembly orchestrator
CLAUDE.md                    # Module documentation
```

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Breaking imports | Re-exports from old locations |
| Large PR size | Move files in small batches |
| Test failures | Run tests after each batch |
| Circular dependencies | Map dependencies before moving |

---

## Related Documentation

- `context-builders/CLAUDE.md` - Context builder specifics
- `CONTEXT-BUILDERS-RATIONALIZATION.md` - Context builder plan
- `CONTEXT-BUILDERS-MIGRATION-TRACKER.md` - Context builder progress
- `triggers/CLAUDE.md` - Trigger system documentation

---

*"The goal is not omniscience. It's wisdom - knowing what to say, when to say it, and when to simply be present."*
