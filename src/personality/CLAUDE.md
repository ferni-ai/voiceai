# Personality Module

> **We believe in making AI human, and the decisions we make will reflect that.**

The personality module enables human-like personality emergence through memory, timing intelligence, and emotional pattern tracking. Personality emerges through behavior, not repetition.

---

## Architecture Level

```
Level 70: personality/         ← THIS LAYER (Domain)
         ↓ imports from
Level 60: services/
Level 30: memory/
Level 10: config/, utils/, types/
```

---

## Directory Structure

```
personality/
├── index.ts                    # Main exports
├── types.ts                    # Type definitions
│
├── memory-adapter.ts           # 🧠 Semantic relevance + callbacks
├── timing-intelligence.ts      # ⏰ When to share vs listen
├── emotional-patterns.ts       # 😊 Pattern recognition
├── growth-tracking.ts          # 📈 Track personal growth
├── pattern-analysis.ts         # Analyze behavioral patterns
├── pattern-persistence.ts      # Persist patterns to Firestore
│
├── callback-helpers.ts         # Callback utilities
├── callback-persistence.ts     # Persist callbacks
├── personal-moment-store.ts    # Store personal moments
├── transitions.ts              # Personality transitions
│
├── moments/                    # 💫 Personal moment handling
│   └── (moment registry, types)
│
└── emotional-data.ts           # Emotional data structures
```

---

## Key Components

| Component | File | Purpose |
|-----------|------|---------|
| **Memory Adapter** | `memory-adapter.ts` | Semantic relevance scoring, callback management |
| **Timing Intelligence** | `timing-intelligence.ts` | Know when to share vs listen |
| **Emotional Patterns** | `emotional-patterns.ts` | Recognize emotional patterns |
| **Growth Tracking** | `growth-tracking.ts` | Track user's personal growth |
| **Moment Store** | `personal-moment-store.ts` | Registry for all personas |

---

## Philosophy

**Personality emerges through behavior, not repetition.**

- Each user discovers personality uniquely
- No universal personality traits
- The "smile factor" emerges from callbacks
- Timing matters as much as content

---

## Memory Adapter Pattern

```typescript
import { getMemoryAdapter } from './personality/memory-adapter.js';

const adapter = getMemoryAdapter(userId, sessionId);

// Score relevance
const score = await adapter.scoreRelevance({
  memory: savedMemory,
  currentContext: conversationContext,
});

// Register callback
await adapter.registerCallback({
  trigger: 'user mentions their dog',
  response: 'Remember Max? How is he doing?',
});
```

---

## Timing Intelligence

Know when to share personal moments:

```typescript
import { getTimingIntelligence } from './personality/timing-intelligence.js';

const timing = getTimingIntelligence(sessionId);

// Check if now is good to share
const shouldShare = await timing.shouldShareNow({
  momentType: 'observation',
  conversationState: 'natural-pause',
  userEnergy: 0.7,
});

// Learn from feedback
await timing.recordOutcome({
  shared: true,
  wellReceived: true,
});
```

---

## Emotional Patterns

Track and recognize emotional patterns:

```typescript
import { getPatternTracker } from './personality/emotional-patterns.js';

const tracker = getPatternTracker(userId);

// Record pattern
await tracker.recordPattern({
  trigger: 'monday-morning',
  emotion: 'anxious',
  frequency: 'weekly',
});

// Check for patterns
const patterns = await tracker.findPatterns({
  timeframe: 'last-30-days',
  minOccurrences: 3,
});
```

---

## Growth Tracking

Track user's personal growth over time:

```typescript
import { getGrowthTracker } from './personality/growth-tracking.js';

const growth = getGrowthTracker(userId);

// Record milestone
await growth.recordMilestone({
  area: 'anxiety-management',
  achievement: 'completed-breathing-exercise',
  significance: 0.7,
});

// Get growth summary
const summary = await growth.getGrowthSummary({
  period: 'last-month',
});
```

---

## Testing

```bash
# Run personality tests
pnpm vitest run src/personality/__tests__/

# Test specific component
pnpm vitest run src/personality/__tests__/timing-intelligence.test.ts
```

---

## Rules

| ✅ Do | ❌ Don't |
|-------|---------|
| Let personality emerge | Force personality traits |
| Use timing intelligence | Share moments randomly |
| Persist patterns to Firestore | Keep patterns in memory only |
| Score relevance contextually | Match keywords blindly |
| Per-user discovery | Universal personality |

---

## Related Docs

- `src/intelligence/CLAUDE.md` - Context builders
- `src/memory/CLAUDE.md` - Memory patterns
- `docs/architecture/SUPERHUMAN-INTELLIGENCE.md`

---

*Last updated: January 2026*
