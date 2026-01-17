# Intelligence Layer

> **"Intelligence is not about having data. It's about knowing what matters right now."**

**Status:** Production-ready ✅ | **Rationalization:** ✅ Complete (January 2026)  
**Tests:** 71 passing | **Validation:** All 22 checks passing

This is Ferni's brain - the layer that turns 98 entity types into genuine awareness and intelligent responses.

---

## ✅ Rationalization Complete (January 2026)

**464 files have been organized into a clean, domain-driven architecture.**

### New Module Structure

| Folder | Purpose | Files |
|--------|---------|-------|
| `core/` | Infrastructure (assembler, API, orchestrators) | 6 |
| `detectors/` | Pure detection (emotion, intent, distress) | 11 |
| `state/` | Session & conversation state | 3 |
| `deep-understanding/` | Superhuman understanding (silence, rhythm, etc.) | 13 |
| `tracking/` | Learning & tracking (humor, stories, patterns) | 14 |
| `collective/` | Collective intelligence | 5 |
| `coaching/` | Coaching intelligence | 5 |
| `context-builders/` | Context injection system | 220 |
| `predictive/` | Predictive intelligence | 33 |
| `triggers/` | Superhuman triggers | 41 |

### Migration Documentation
- `docs/architecture/INTELLIGENCE-RATIONALIZATION.md` - Architecture plan
- `docs/architecture/INTELLIGENCE-MIGRATION-TRACKER.md` - Completed tracker
- `docs/architecture/CONTEXT-BUILDERS-MIGRATION-TRACKER.md` - Context builders tracker

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
│                 LEVEL 3: TEMPORAL INTELLIGENCE                  │
│  (patterns/temporal-patterns.ts - coming soon)                  │
│  "You always get anxious before quarterly reviews..."           │
└─────────────────────────────────────────────────────────────────┘
                                ▲
┌─────────────────────────────────────────────────────────────────┐
│                 LEVEL 2: CONTEXTUAL AWARENESS                   │
│  context-assembler.ts                                           │
│  "Given your meeting with Sarah today..."                       │
└─────────────────────────────────────────────────────────────────┘
                                ▲
┌─────────────────────────────────────────────────────────────────┐
│                 LEVEL 1: DATA FOUNDATION                        │
│  ../services/data-layer/                                        │
│  98 Entity Types × Semantic Memory × Structured Stores          │
└─────────────────────────────────────────────────────────────────┘
```

---

## Quick Start

```typescript
import {
  // Unified API
  getIntelligenceForTurn,
  initIntelligenceSession,
  cleanupIntelligence,

  // Lower-level access
  assembleContext,
  recordDomainSignal,
  checkProactiveTriggers,
} from './index.js';

// At session start
initIntelligenceSession(userId);

// Each turn
const { context, correlations, proactiveInsights } = await getIntelligenceForTurn(userId, {
  moment: 'session_start', // or 'natural_pause', 'topic_relevant', etc.
});

// Use proactive insights
if (proactiveInsights.length > 0) {
  const insight = proactiveInsights[0];
  // Surface insight.message to user
  markInsightSurfaced(userId, insight.id);
}

// At session end
cleanupIntelligence(userId);
```

---

## Key Files

| File | Level | Purpose |
|------|-------|---------|
| `context-assembler.ts` | L2 | Assembles all relevant context for a user |
| `patterns/cross-domain-correlator.ts` | L4 | Detects patterns across life domains |
| `proactive/proactive-engine.ts` | L5 | Decides when/what to surface proactively |
| `unified-intelligence-api.ts` | All | Single entry point for intelligence |
| `index.ts` | Export | Unified exports for the layer |

---

## Level 2: Context Assembly

The Context Assembler collects and prioritizes all relevant context:

```typescript
interface ContextWindow {
  immediate: ImmediateContext;   // What's happening NOW
  today: TodayContext;           // Today's agenda
  recent: RecentContext;         // Last 7 days
  relationship: RelationshipContext; // Trust, commitments, boundaries
  capacity: CapacityContext;     // User's bandwidth

  activeDomains: EntityType[];   // Most relevant domains right now
  pendingInsights: ProactiveInsight[]; // Ready to surface
}
```

### Context Priority

| Priority | Category | Example |
|----------|----------|---------|
| **P0** | Safety/Crisis | Boundaries, mental health signals |
| **P1** | Emotional | Current mood, recent vulnerability |
| **P2** | Time-Sensitive | Today's meetings, deadlines |
| **P3** | Relationship | Active commitments, inside jokes |
| **P4** | Growth | Current coaching themes |
| **P5** | Background | Preferences, patterns |

---

## Level 4: Cross-Domain Correlation

Detects patterns ACROSS life domains that humans miss:

```typescript
// Record signals from domain stores
recordDomainSignal(userId, {
  domain: 'sleep_pattern',
  store: 'health',
  metric: 'quality',
  direction: 'decreased',
  magnitude: 'moderate',
  timestamp: new Date(),
});

// Get detected correlations
const correlations = getCorrelations(userId, {
  minConfidence: 'likely',
  domain: 'sleep_pattern',
});
```

### Built-in Correlation Patterns

| Pattern | Insight |
|---------|---------|
| Sleep-Work Stress | "Sleep quality dips when work stress increases" |
| Habit-Travel Break | "Habit streaks often break during travel weeks" |
| Mood-Exercise Lift | "Mood tends to lift after exercise sessions" |
| Journaling-Clarity | "Breakthroughs often come after journaling" |
| Anxiety-Decision | "Decisions feel heavier when anxiety is high" |

---

## Level 5: Proactive Intelligence

Decides WHEN to surface insights without being annoying:

```typescript
// Check triggers
const insights = checkProactiveTriggers(context, 'session_start', correlations);

// Surface strategically
if (insights.length > 0 && insights[0].priority <= 3) {
  // High priority - surface at session start
}
```

### Proactive Categories

| Category | Priority | Example |
|----------|----------|---------|
| **Safety** | 1-2 | Late night check, overwhelm detection |
| **Protection** | 3-4 | Commitment deadlines, boundary respect |
| **Support** | 5-6 | Habit struggles, mood decline |
| **Growth** | 6-7 | Pattern observations, growth reflections |
| **Celebration** | 7-8 | Milestones, streak achievements |
| **Connection** | 8-9 | Inside jokes, thinking of you |

### The Art of Not Being Annoying

- Max 2 proactive insights per session
- Cooldown periods between repeats
- Trust level requirements (new → deep)
- User preference learning

---

## Integration Points

### With Turn Handler

```typescript
// In turn-handler.ts
const intelligence = await getIntelligenceForTurn(userId, {
  moment: 'session_start',
  voiceEmotion: voiceEmotionResult,
});

// Add to context
const contextForLLM = formatContextForLLM(
  selectContextForTurn(intelligence.context, userMessage, persona)
);
```

### With Domain Stores

The domain stores should call `recordDomainSignal()` when data changes:

```typescript
// In productivity-store.ts
setHabit(userId, habit) {
  // ... save habit ...
  
  recordDomainSignal(userId, {
    domain: 'habit',
    store: 'productivity',
    metric: habit.name,
    direction: 'changed',
    magnitude: 'moderate',
    timestamp: new Date(),
  });
}
```

### With Context Builders

```typescript
// In context builder
import { assembleContext } from '../index.js';

const context = await assembleContext(userId);
if (context.immediate.currentMood === 'overwhelmed') {
  // Adjust response accordingly
}
```

---

## The "Better Than Human" Advantage

| What Humans Can't Do | What Ferni Does |
|---------------------|-----------------|
| Remember every detail | Perfect recall across 98 entity types |
| Track patterns objectively | Cross-domain correlation detection |
| Be available 24/7 | Same warmth at 2am and noon |
| See across life domains | Holistic pattern recognition |
| Never have bad days | Consistent emotional availability |

---

## Key Principles

### 1. Relevance Over Completeness
Don't dump everything you know. Surface what matters NOW.

### 2. Timing Is Everything
The same insight can be brilliant or annoying based on when it's shared.

### 3. Earn the Right
Build trust before offering unsolicited insights. Start subtle, grow over time.

### 4. Protect, Don't Police
Use intelligence to protect and support, never to judge or lecture.

### 5. Human Warmth First
All intelligence should feel like it comes from a friend who genuinely cares, not an algorithm that's been tracking you.

---

## Related Documentation

- [Intelligent Agent Architecture](/docs/architecture/INTELLIGENT-AGENT-ARCHITECTURE.md)
- [Data Layer CLAUDE.md](/src/services/data-layer/CLAUDE.md)
- [Entity Types](/src/services/data-layer/types.ts)

---

*"The goal is not omniscience. It's wisdom - knowing what to say, when to say it, and when to simply be present."*
