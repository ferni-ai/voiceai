# Intelligence Layer

> "Intelligence is not about having data. It's about knowing what matters right now."

Ferni's brain — turns entity data into genuine awareness, proactive insights, and contextual intelligence.

---

## Module Index

| Folder | Purpose | CLAUDE.md |
|--------|---------|-----------|
| `core/` | Infrastructure: context assembler, unified API | - |
| `context-builders/` | 200+ context injection builders (see CLAUDE.md) | ✅ |
| `context-routing/` | Smart builder selection, caching, slot allocation | ✅ |
| `predictive/` | Predictive intelligence, embeddings, life phase | - |
| `triggers/` | Superhuman proactive triggers (6 phases) | ✅ |
| `deep-understanding/` | Avoidance detection, micro-moments, pattern connector | - |
| `memory-intelligence/` | Memory surfacing timing, phrasing, learning | ✅ |
| `cognitive/` | Cognitive pattern engine | - |
| `coaching/` | Dynamic coaching questions | - |
| `collective/` | Collective intelligence | - |
| `conversation-quality/` | Small details tracking | - |
| `data-capture/` | Real-time data capture | - |
| `detectors/` | Emotion, intent, distress detection | - |
| `feedback/` | Injection tracking, feedback loops | - |
| `human-behaviors/` | Running jokes, human-like behaviors | - |
| `patterns/` | Cross-domain correlator, pattern index | - |
| `proactive/` | Proactive surfacing engine | - |
| `relationship/` | Relationship engine, depth tracking | - |
| `semantic-intelligence/` | Tool hints, semantic understanding | - |
| `state/` | Session & conversation state | - |
| `story-tracking/` | Story arc tracking | - |
| `superhuman-memory/` | Superhuman memory capabilities | - |
| `surfacing/` | Proactive surfacing engine | - |
| `tracking/` | Learning & tracking (humor, stories) | - |
| `unified/` | Unified intelligence interfaces | - |
| `user-knowledge/` | User knowledge aggregation | - |
| `user-learning-engine/` | User behavior learning, profile application | - |
| `utils/` | Shared intelligence utilities | - |

---

## Architecture: The Intelligence Stack

```
┌─────────────────────────────────────────────────────────────────┐
│                 LEVEL 5: PROACTIVE INTELLIGENCE                 │
│  proactive/proactive-engine.ts                                  │
│  "I noticed you haven't journaled since your breakup..."        │
└─────────────────────────────────────────────────────────────────┘
                                ▲
┌─────────────────────────────────────────────────────────────────┐
│                 LEVEL 4: CROSS-DOMAIN REASONING                 │
│  patterns/cross-domain-correlator.ts                            │
│  "Your sleep drops when work stress increases..."               │
└─────────────────────────────────────────────────────────────────┘
                                ▲
┌─────────────────────────────────────────────────────────────────┐
│                 LEVEL 3: PREDICTIVE INTELLIGENCE                │
│  predictive/ (embeddings, life phase, trajectories)             │
│  "Based on patterns, you may be approaching burnout..."         │
└─────────────────────────────────────────────────────────────────┘
                                ▲
┌─────────────────────────────────────────────────────────────────┐
│                 LEVEL 2: CONTEXTUAL AWARENESS                   │
│  core/context-assembler.ts + context-builders/ (200+ builders)  │
│  "Given your meeting with Sarah today..."                       │
└─────────────────────────────────────────────────────────────────┘
                                ▲
┌─────────────────────────────────────────────────────────────────┐
│                 LEVEL 1: DATA FOUNDATION                        │
│  ../services/data-layer/ + ../memory/                           │
│  Entity Types × Semantic Memory × Structured Stores             │
└─────────────────────────────────────────────────────────────────┘
```

---

## Quick Start

```typescript
import {
  getIntelligenceForTurn,
  initIntelligenceSession,
  cleanupIntelligence,
  assembleContext,
  recordDomainSignal,
  checkProactiveTriggers,
} from './index.js';

// At session start
initIntelligenceSession(userId);

// Each turn — get contextual intelligence
const { context, correlations, proactiveInsights } = await getIntelligenceForTurn(userId, {
  moment: 'session_start',
});

// At session end
cleanupIntelligence(userId);
```

---

## Key Files

| File | Purpose |
|------|---------|
| `core/context-assembler.ts` | Assembles all relevant context for a user |
| `core/unified-intelligence-api.ts` | Single entry point for intelligence |
| `patterns/cross-domain-correlator.ts` | Detects patterns across life domains |
| `proactive/proactive-engine.ts` | Decides when/what to surface proactively |
| `index.ts` | Unified exports |

---

## Subdirectory Documentation

For detailed documentation on major subsystems:
- `context-builders/CLAUDE.md` — How context builders work (200+ builders)
- `context-routing/CLAUDE.md` — Smart builder selection and caching
- `triggers/CLAUDE.md` — Superhuman trigger intelligence (6 phases)
- `memory-intelligence/CLAUDE.md` — Memory surfacing timing and phrasing

---

## Key Principles

1. **Relevance Over Completeness** — Surface what matters NOW, not everything known
2. **Timing Is Everything** — Same insight can be brilliant or annoying based on timing
3. **Earn the Right** — Build trust before unsolicited insights
4. **Protect, Don't Police** — Intelligence supports, never judges

---

## Related Documentation

- `docs/architecture/CLEAN-ARCHITECTURE.md` — Architecture layers
- `src/services/data-layer/CLAUDE.md` — Data foundation
- `src/memory/CLAUDE.md` — Memory system (L1/L2/L3)

---

*Last updated: January 2026*
