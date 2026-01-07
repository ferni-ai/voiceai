# Context Builders Rationalization

> **"We believe in making AI human, and the decisions we make will reflect that."**

This document provides a comprehensive plan to rationalize the 119+ context builder files into a clean, discoverable, maintainable architecture that embodies the "Better Than Human" philosophy.

**Status:** 📋 Planning Complete | **Created:** January 2026

---

## Executive Summary

### The Problem
- **119+ builder files** with inconsistent naming
- **80 loose files** at root level that should be organized
- **5 different naming conventions** (`-context`, `-insights`, `-awareness`, `-intelligence`, no suffix)
- **Dual systems**: Legacy (deprecated) vs Behavioral (preferred), causing confusion
- **"Better Than Human" capabilities** scattered and hard to discover
- **Technical debt** from organic growth

### The Solution
A phased migration that:
1. Completes the behavioral system migration (architecturally superior)
2. Organizes files by **capability domain** (not technical function)
3. Standardizes naming to **one convention per purpose**
4. Makes superhuman capabilities **discoverable and testable**
5. Preserves backward compatibility throughout

---

## Current State Audit

### File Counts by Location

| Location | File Count | Status |
|----------|------------|--------|
| Root level (loose) | 80 | ❌ Need organization |
| `core/` | 13 | ✅ Foundation - keep |
| `awareness/` | 11 | ✅ Well organized |
| `behavioral/` | 19 | ✅ New system - expand |
| `coaching/` | 7 | ✅ Well organized |
| `emotional/` | 8 | ✅ Well organized |
| `humanization/` | 6 | ✅ Consolidating |
| `memory/` | 10 | ✅ Has orchestrator |
| `personas/` | 60 | ✅ Well organized |
| `relationship-arc/` | 7 | ✅ Well organized |
| `session/` | 5 | ✅ Well organized |
| `superhuman/` | 8 | ⚠️ Needs expansion |
| **Total** | **119+** | |

### Naming Convention Audit

| Pattern | Count | Examples | Recommended |
|---------|-------|----------|-------------|
| `-context` | ~15 | `coaching-context.ts`, `game-context.ts` | For session/turn state |
| `-insights` | ~12 | `superhuman-insights.ts`, `maya-habit-insights.ts` | For cross-domain patterns |
| `-awareness` | ~11 | `calendar-awareness.ts`, `alive-awareness.ts` | For external/situational facts |
| `-intelligence` | ~5 | `temporal-intelligence.ts`, `semantic-intelligence-integration.ts` | For "Better Than Human" capabilities |
| No suffix | ~20 | `cognitive.ts`, `engagement.ts`, `memory.ts` | Legacy - migrate to above |
| `.behavioral.ts` | 8 | `emotional.behavioral.ts`, `pacing.behavioral.ts` | For behavioral signal builders |

### Registration Analysis (293 calls across 145 files)

| Registry Type | Count | System |
|---------------|-------|--------|
| `registerContextBuilder` | ~285 | Legacy (deprecated) |
| `registerBehavioralBuilder` | ~8 | Behavioral (preferred) |

---

## Target Architecture

### Vision: Domain-Driven Organization

```
context-builders/
│
├── core/                           # Foundation (keep as-is)
│   ├── types.ts                    # Type definitions
│   ├── registry.ts                 # Builder registration
│   ├── loader.ts                   # Lazy loading
│   ├── categories.ts               # Category enum
│   ├── builder-imports.ts          # Import registry
│   └── ...
│
├── behavioral/                     # NEW SYSTEM (expand this)
│   ├── builders/                   # Behavioral signal builders
│   │   ├── emotional.behavioral.ts
│   │   ├── pacing.behavioral.ts
│   │   ├── memory.behavioral.ts
│   │   └── ... (expand)
│   ├── aggregator.ts
│   ├── integration.ts
│   └── ...
│
├── safety/                         # P0 - Always runs first
│   ├── crisis.ts                   # Crisis detection
│   ├── wellbeing-context.ts        # Wellbeing signals
│   ├── principal-alignment.ts      # Value alignment
│   └── honesty-guardrail.ts        # Honesty checks
│
├── intelligence/                   # "Better Than Human" capabilities ⭐
│   ├── temporal-intelligence.ts    # Time pattern detection
│   ├── pattern-surfacing.ts        # Cross-domain patterns
│   ├── prediction-surfacing.ts     # Predictive insights
│   ├── deep-understanding.ts       # Silence, rhythm, resistance
│   ├── life-context-synthesis.ts   # Cross-domain synthesis
│   ├── voice-mismatch-critical.ts  # THE superhuman signal
│   ├── proactive-noticing.ts       # "I notice..." patterns
│   └── semantic-intelligence-integration.ts
│
├── memory/                         # Memory systems (keep as-is, well organized)
│   ├── unified-memory-orchestrator.ts  # Coordinator
│   ├── better-than-human-memory.ts     # Proactive surfacing
│   ├── knowledge-graph-context.ts      # Entity graph
│   └── ...
│
├── emotional/                      # Emotion handling (keep as-is)
│   ├── celebration.ts
│   ├── voice-emotion.ts
│   ├── energy-awareness.ts
│   └── ...
│
├── awareness/                      # External/situational facts (keep as-is)
│   ├── calendar-awareness.ts
│   ├── world-awareness.ts
│   └── ...
│
├── relationship/                   # NEW: Consolidated relationship
│   ├── arc/                        # Relationship stages (move from relationship-arc/)
│   │   ├── first-meeting-magic.ts
│   │   ├── acquaintance-deepening.ts
│   │   ├── friendship-flowering.ts
│   │   └── trusted-advisor.ts
│   ├── trust-context.ts            # Move from root
│   ├── deep-relationship.ts        # Move from root
│   ├── relationship-behaviors.ts   # Move from root
│   ├── social-relationships.ts     # Move from root
│   └── social-graph-context.ts     # Move from root
│
├── engagement/                     # NEW: User engagement
│   ├── engagement.ts               # Move from root
│   ├── engagement-context.ts       # Move from root
│   ├── game-context.ts             # Move from root
│   ├── music.ts                    # Move from root
│   ├── music-emotion-offers.ts     # Move from root
│   ├── daily-rituals.ts            # Move from root
│   └── storytelling.ts             # Move from root
│
├── personas/                       # Persona-specific (keep as-is, well organized)
│   ├── persona-identity.ts
│   ├── ferni-coordinator-insights/
│   ├── maya-coaching-insights/
│   └── ...
│
├── coaching/                       # Life coaching (keep as-is)
│   ├── coaching-context.ts
│   ├── therapeutic-frameworks.ts
│   └── ...
│
├── session/                        # Session management (keep as-is)
│   ├── session-flow.ts
│   ├── conversation-recap.ts
│   └── ...
│
├── humanization/                   # Speech naturalness (keep as-is)
│   ├── unified-humanizing.ts       # Consolidated orchestrator
│   ├── conversational-imperfections.ts  # Move from root
│   └── ...
│
├── team/                           # NEW: Multi-persona coordination
│   ├── team-availability.ts        # Move from superhuman/
│   ├── team-dynamics.ts            # Move from superhuman/
│   ├── team-gossip.ts              # Move from superhuman/
│   ├── handoff.ts                  # Move from superhuman/
│   ├── role-boundaries.ts          # Move from root
│   ├── cameo-opportunities.ts      # Move from root
│   └── cameo-unlock.ts             # Move from root
│
├── superhuman/                     # "Better Than Human" services
│   ├── superhuman-insights.ts
│   ├── superhuman-integration.ts
│   ├── generated-insights.ts
│   ├── superhuman-session-priming.ts  # Move from root
│   ├── better-than-human-direct.ts    # Move from root
│   └── conversational-superpowers.ts  # Move from root
│
└── external/                       # NEW: External integrations
    ├── biometrics.ts               # Move from root
    ├── financial-prediction.ts     # Move from root
    ├── macos-context.ts            # Move from root
    └── ...
```

### Naming Convention Standard

| Purpose | Convention | Example |
|---------|------------|---------|
| **External facts about the world** | `*-awareness.ts` | `calendar-awareness.ts` |
| **Superhuman cross-domain patterns** | `*-intelligence.ts` | `temporal-intelligence.ts` |
| **Session/turn temporary state** | `*-context.ts` | `coaching-context.ts` |
| **Deep persona-specific insights** | `*-insights.ts` | `maya-coaching-insights.ts` |
| **Behavioral signal builders** | `*.behavioral.ts` | `emotional.behavioral.ts` |
| **Orchestrators/coordinators** | `unified-*.ts` | `unified-memory-orchestrator.ts` |

---

## Migration Plan

### Phase 1: Documentation & Audit (Week 1)
**Goal:** Complete understanding before any changes

- [ ] Create this architecture document ✅
- [ ] Audit all 119+ files for actual usage (grep for imports)
- [ ] Identify dead code (files imported but never registered)
- [ ] Map dependencies between builders
- [ ] Document which builders are DISABLED vs ACTIVE in `loader.ts`

### Phase 2: Behavioral Migration (Weeks 2-4)
**Goal:** Complete the behavioral system migration

The behavioral system is architecturally superior:
- No context leakage (can't speak internal guidance)
- Structured signals (type-safe)
- Clear separation: Behavioral (HOW) vs Awareness (WHAT) vs Tool Guidance (WHEN)

**Priority order for behavioral migration:**
1. ✅ `emotional.behavioral.ts` - Done
2. ✅ `memory.behavioral.ts` - Done
3. ✅ `distress.behavioral.ts` - Done
4. ✅ `pacing.behavioral.ts` - Done
5. ✅ `humanizing.behavioral.ts` - Done
6. ✅ `validation.behavioral.ts` - Done
7. ✅ `awareness.behavioral.ts` - Done
8. ✅ `energy.behavioral.ts` - Done
9. 🔲 `persona.behavioral.ts` - Convert persona signals
10. 🔲 `coaching.behavioral.ts` - Convert coaching signals
11. 🔲 `engagement.behavioral.ts` - Convert engagement signals
12. 🔲 `relationship.behavioral.ts` - Convert relationship signals

**For each conversion:**
```typescript
// 1. Create new behavioral builder
// behavioral/builders/my-feature.behavioral.ts

// 2. Return signals, NOT facts
return {
  tone: 'gentle',
  style: 'supportive',
  callbacks: [{
    type: 'pattern',
    hint: 'They seem interested in exploring this further.',
    strength: 'natural',
  }],
};

// 3. Update builder-imports.ts to reference behavioral version
// 4. Update BUILDER_MANIFEST in loader.ts to DISABLE legacy
// 5. Test: verify no context leakage
```

### Phase 3: Folder Organization (Weeks 5-6)
**Goal:** Move loose files to proper homes

**Moves by new folder:**

#### `intelligence/` (NEW - "Better Than Human" capabilities)
```bash
# Move these from root to intelligence/
mv temporal-intelligence.ts intelligence/
mv pattern-surfacing.ts intelligence/
mv prediction-surfacing.ts intelligence/
mv deep-understanding.ts intelligence/
mv life-context-synthesis.ts intelligence/
mv voice-mismatch-critical.ts intelligence/
mv proactive-noticing.ts intelligence/
mv semantic-intelligence-integration.ts intelligence/  # from superhuman/
```

#### `relationship/` (NEW - Consolidated)
```bash
# Rename relationship-arc/ to relationship/arc/
mv relationship-arc/* relationship/arc/

# Move these from root to relationship/
mv trust-context.ts relationship/
mv deep-relationship.ts relationship/
mv relationship-behaviors.ts relationship/
mv social-relationships.ts relationship/
mv social-graph-context.ts relationship/
```

#### `engagement/` (NEW)
```bash
# Move these from root to engagement/
mv engagement.ts engagement/
mv engagement-context.ts engagement/
mv game-context.ts engagement/
mv music.ts engagement/
mv music-emotion-offers.ts engagement/
mv daily-rituals.ts engagement/
mv storytelling.ts engagement/
```

#### `team/` (NEW - from superhuman/ and root)
```bash
# Move these from superhuman/ to team/
mv superhuman/team-availability.ts team/
mv superhuman/team-dynamics.ts team/
mv superhuman/team-gossip.ts team/
mv superhuman/handoff.ts team/

# Move these from root to team/
mv role-boundaries.ts team/
mv cameo-opportunities.ts team/
mv cameo-unlock.ts team/
```

#### `safety/` (NEW)
```bash
# Move these from core/ and root to safety/
mv core/crisis.ts safety/
mv core/wellbeing-context.ts safety/
mv principal-alignment.ts safety/
mv honesty-guardrail.ts safety/
```

#### `external/` (NEW)
```bash
# Move these from root to external/
mv biometrics.ts external/
mv financial-prediction.ts external/
mv macos-context.ts external/
mv anticipation.ts external/
```

### Phase 4: Naming Standardization (Week 7)
**Goal:** Consistent naming across all files

**Renames:**
```bash
# Standardize to -intelligence suffix for superhuman capabilities
mv cognitive.ts cognitive-intelligence.ts
mv anticipation.ts anticipation-intelligence.ts

# Standardize to -awareness suffix for external facts
mv personal-journey.ts journey-awareness.ts

# Standardize to -context suffix for session state
mv personal.ts personal-context.ts
mv discovery.ts discovery-context.ts
mv topics.ts topics-context.ts
```

### Phase 5: Update Imports & Manifest (Week 8)
**Goal:** Update all references to moved files

For each moved file:
1. Update `builder-imports.ts` with new path
2. Update `BUILDER_MANIFEST` in `loader.ts`
3. Update `BUILDER_CATEGORIES` in `categories.ts`
4. Run `pnpm typecheck` to find broken imports
5. Update any direct imports in other files

### Phase 6: Clean Up & Documentation (Week 9)
**Goal:** Final polish

- [ ] Delete any dead code identified in Phase 1
- [ ] Update `context-builders/CLAUDE.md` with new structure
- [ ] Update `context-builders/index.ts` exports
- [ ] Add README.md to each new folder
- [ ] Run full test suite
- [ ] Update docs/architecture/*.md files

---

## Files to Move: Complete List

### Root → `intelligence/` (12 files)
```
temporal-intelligence.ts
pattern-surfacing.ts
prediction-surfacing.ts
deep-understanding.ts
life-context-synthesis.ts
voice-mismatch-critical.ts
proactive-noticing.ts
commitment-follow-up.ts
sec-intelligence.ts
unified-intelligence-context.ts
inner-world-injector.ts
```

### Root → `relationship/` (5 files)
```
trust-context.ts
deep-relationship.ts
relationship-behaviors.ts
social-relationships.ts
social-graph-context.ts
```

### Root → `engagement/` (7 files)
```
engagement.ts
engagement-context.ts
game-context.ts
music.ts
music-emotion-offers.ts
daily-rituals.ts
storytelling.ts
```

### Root → `team/` (3 files from root + 4 from superhuman/)
```
role-boundaries.ts
cameo-opportunities.ts
cameo-unlock.ts
+ superhuman/team-availability.ts
+ superhuman/team-dynamics.ts
+ superhuman/team-gossip.ts
+ superhuman/handoff.ts
```

### Root → `safety/` (2 files from core/ + 2 from root)
```
+ core/crisis.ts
+ core/wellbeing-context.ts
principal-alignment.ts
honesty-guardrail.ts
```

### Root → `superhuman/` (3 files)
```
superhuman-session-priming.ts
better-than-human-direct.ts
conversational-superpowers.ts
```

### Root → `external/` (5 files)
```
biometrics.ts
financial-prediction.ts
macos-context.ts
anticipation.ts
pending-call-results.ts
```

### Root → `humanization/` (4 files)
```
conversational-imperfections.ts
natural-uncertainty.ts
response-length.ts
dynamic-speech-guidance.ts
```

### Root → `personas/` (3 files)
```
ferni-personality.ts
human-personality.ts
physical-presence.ts
lovable-presence.ts
spontaneous-vulnerability.ts
twin-profile-context.ts
```

### Root → `awareness/` (1 file - to consolidate existing folder)
```
revelation-awareness.ts → awareness/ (capability throttling)
```

### Root → `coaching/` (2 files)
```
life-coaching-context.ts
methodology.ts
```

### Root → `session/` (1 file)
```
thread-context.ts
```

### Root → `memory/` (2 files)
```
memory-enhancement.ts
thinking-of-you.ts
```

### Files that stay at root (utilities/infrastructure)
```
index.ts                    # Main entry
metrics.ts                  # Performance tracking
builder-prioritization.ts   # Builder scoring
fast-conditional-loading.ts # Loading optimization
tiered-execution.ts         # Execution optimization
dynamic-trigger-utils.ts    # Trigger utilities
persona-insights-cache.ts   # Caching
goodbye.ts                  # Session end (keep at root for visibility)
```

---

## Backward Compatibility

### Import Strategy

All moves will use re-exports from original locations during migration:

```typescript
// OLD: src/intelligence/context-builders/trust-context.ts
// After move, this file becomes:

export * from './relationship/trust-context.js';
// Deprecated - use './relationship/trust-context.js' directly
```

This allows:
1. Existing imports continue to work
2. Gradual migration of import statements
3. Eventually remove deprecated re-exports

### Registry Compatibility

The builder names in the registry remain unchanged:
- `registerContextBuilder('trust-context', ...)` still works
- Only file paths change
- `builder-imports.ts` handles path mapping

---

## Success Metrics

| Metric | Before | Target |
|--------|--------|--------|
| Files at root level | 80 | <10 |
| Behavioral builders | 8 | 40+ |
| Naming conventions | 5 | 1 per purpose |
| "Better Than Human" files discoverable | Scattered | `intelligence/` folder |
| New developer onboarding time | Hours | Minutes |
| Test coverage of behavioral system | ~20% | 80%+ |

---

## Key Decisions Made

1. **Keep behavioral system as target** - It's architecturally superior (no context leakage)
2. **Domain-driven organization** - Group by capability, not technical function
3. **Standardized naming** - One convention per purpose type
4. **"Better Than Human" visibility** - Dedicated `intelligence/` folder
5. **Backward compatible** - Re-exports during migration
6. **Preserve personas organization** - Already well structured

---

## Related Documentation

- `context-builders/CLAUDE.md` - Quick reference for new builders
- `context-builders/behavioral/README.md` - Behavioral system deep dive
- `context-builders/memory/README.md` - Memory system architecture
- `docs/architecture/UNIFIED-INTELLIGENCE-ARCHITECTURE.md` - Overall intelligence
- `docs/architecture/CROSS-PERSONA-INTELLIGENCE.md` - Persona coordination

---

*"Context builders are how we make AI emotionally intelligent. They inject the awareness, empathy, and memory that transforms responses from robotic to human."*
