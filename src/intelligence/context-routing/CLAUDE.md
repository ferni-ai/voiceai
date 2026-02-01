# Smart Context Routing

> **Phase 2 of BTH Communication System Overhaul**

ML-informed context selection with dynamic slot allocation. Transforms Ferni from "spray and hope" injection to intelligent, feedback-driven selection.

---

## Quick Reference

```typescript
import {
  createSmartSelector,
  selectInjections,
  setupSmartRoutingExperiment,
} from '../intelligence/context-routing/index.js';

// At session start
const selector = createSmartSelector(userId, sessionId);
await selector.warmCache(loadUserData, loadGlobalData);

// Each turn
const decision = await selector.selectInjections(injections, {
  userId,
  sessionId,
  userText,
  emotionalIntensity,
  crisisDetected,
});

// Use selected injections
const filtered = decision.selected;

// At session end
selector.cleanup();
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                       SmartSelector                              │
│  (Main orchestrator - wraps existing filterInjections)           │
└─────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌───────────────┐     ┌───────────────┐     ┌───────────────┐
│ SlotAllocator │     │ Predictive    │     │ Cache         │
│               │     │ Scorer        │     │ Manager       │
│ Mode-based    │     │               │     │               │
│ distribution  │     │ ML + heuristic│     │ Three-tier    │
└───────────────┘     │ scoring       │     │ caching       │
                      └───────────────┘     └───────────────┘
                              │                     │
                              └─────────────────────┘
                                        │
                              ┌─────────────────────┐
                              │ FeedbackAggregator  │
                              │ (Firestore persist) │
                              └─────────────────────┘
```

---

## Directory Structure

```
src/intelligence/context-routing/
├── index.ts                # Public exports
├── types.ts                # Type definitions
├── slot-allocator.ts       # Mode-based slot distribution
├── cache-manager.ts        # Three-tier caching (session/user/global)
├── predictive-scorer.ts    # ML scoring with heuristic fallbacks
├── smart-selector.ts       # Main orchestrator
├── feedback-aggregator.ts  # Firestore persistence
├── __tests__/              # Test suite
│   └── smart-selector.test.ts
└── CLAUDE.md               # This file
```

---

## Key Concepts

### Dynamic Slot Allocation

Slots are distributed based on conversation mode:

| Mode | Emotional | Practical | Memory | Superhuman | Safety |
|------|-----------|-----------|--------|------------|--------|
| **crisis** | 3 | 1 | 1 | 1 | ∞ |
| **emotional** | 2 | 1 | 2 | 1 | ∞ |
| **practical** | 1 | 3 | 1 | 1 | ∞ |
| **deep** | 1 | 1 | 2 | 2 | ∞ |
| **casual** | 1 | 1 | 0 | 1 | ∞ |
| **unknown** | 1 | 2 | 1 | 2 | ∞ |

**Safety slots are always unlimited** - essential categories bypass slot limits.

### Predictive Scoring

Score formula:
```
score = (roiScore × 0.4) + (modeRelevance × 0.3) + (recencyBoost × 0.15) + (userAffinity × 0.15)
```

| Factor | Weight | Source |
|--------|--------|--------|
| ROI Score | 40% | Phase 1 feedback tracking |
| Mode Relevance | 30% | Heuristic matrix or historical data |
| Recency Boost | 15% | Recent successes this session |
| User Affinity | 15% | User-specific preferences |

### Three-Tier Caching

| Tier | Storage | TTL | Purpose |
|------|---------|-----|---------|
| **L1 Session** | In-memory | Session | Hot path for current session |
| **L2 User** | In-memory | 5 min | User-specific preferences |
| **L3 Global** | In-memory | 1 min | Aggregated builder effectiveness |

**Target: <50ms for cache lookups**

### Progressive Learning

The system starts with heuristics and learns over time:

| Samples | Mode | Description |
|---------|------|-------------|
| <20 | Fallback | Pure heuristic (MODE_CATEGORY_RELEVANCE) |
| 20-100 | Heuristic | Data + heuristics blended |
| >100 | ML | Full data-driven scoring |

---

## Integration Points

### Turn Processor Integration

```typescript
// In turn-processor.ts
import { selectInjections } from '../intelligence/context-routing/index.js';

// Replace filterInjections() call:
const decision = await selectInjections(injections, {
  userId,
  sessionId,
  userText,
  emotionalIntensity,
  crisisDetected,
  useSmartSelection: true,
});
const filtered = decision.selected;
```

### Session Lifecycle

```typescript
// At session start
import { createSmartSelector, getFeedbackAggregator } from '../intelligence/context-routing/index.js';

const selector = createSmartSelector(userId, sessionId);
const aggregator = getFeedbackAggregator();

await selector.warmCache(
  () => aggregator.getUserDataForCache(userId),
  () => aggregator.loadAllBuilderEffectiveness()
);

// At session end
await aggregator.aggregateFromTracker(sessionId, userId, mode);
selector.cleanup();
```

### Experiment Rollout

```typescript
// At startup
import { setupSmartRoutingExperiment } from '../intelligence/context-routing/index.js';

await setupSmartRoutingExperiment();
```

---

## Firestore Schema

### builder_effectiveness/{builderId}

```typescript
interface BuilderEffectivenessDoc {
  builderId: string;
  category: string;
  totalDeliveries: number;
  alignmentCount: number;
  positiveReactions: number;
  negativeReactions: number;
  roiScore: number;           // 0-100
  modeScores: Record<ConversationMode, number>;
  lastUpdated: Timestamp;
  sampleCount: number;
}
```

### user_builder_preferences/{userId}

```typescript
interface UserBuilderPreferencesDoc {
  userId: string;
  effectiveBuilders: string[];
  ineffectiveBuilders: string[];
  modePreferences: Record<ConversationMode, string[]>;
  updatedAt: Timestamp;
}
```

---

## A/B Testing Rollout

The smart routing experiment uses the Learning module's experiment manager:

```typescript
Experiment ID: 'smart-context-routing-v1'

Variants:
- priority: Current priority-based filtering (control)
- hybrid: ML selection with priority validation
- smart: Full ML selection

Rollout stages:
- 2% for 1 hour (100 samples min)
- 10% for 2 hours (500 samples min)
- 25% for 4 hours (2000 samples min)
- 50% for 8 hours (5000 samples min)
- 100% (complete)

Auto-escalate: Yes
Auto-rollback: Yes (on degradation)
```

---

## Testing

```bash
# Run unit tests
pnpm vitest run src/intelligence/context-routing/__tests__/

# Run with coverage
pnpm vitest run src/intelligence/context-routing/__tests__/ --coverage
```

---

## Metrics

| Metric | Description |
|--------|-------------|
| `context_routing_algorithm` | Which algorithm was used (smart/hybrid/priority) |
| `context_routing_confidence` | Confidence in selection (0-1) |
| `context_routing_latency_ms` | Selection processing time |
| `context_routing_slot_utilization` | How full slots were |
| `context_routing_rejections` | Count of rejected injections |

---

## Related Documentation

- `docs/plans/sleepy-gliding-micali.md` - Full BTH Communication System Overhaul plan
- `src/intelligence/feedback/CLAUDE.md` - Phase 1 injection tracking
- `src/tools/experiments/CLAUDE.md` - Experiment manager
- `src/agents/processors/CLAUDE.md` - Turn processor integration

---

*Phase 2 of BTH Communication System Overhaul - January 2026*
