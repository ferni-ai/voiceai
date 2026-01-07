# Knowledge Graph Module

> **"Better Than Human" memory - unified entity-centric knowledge.**

## Overview

This module implements the Unified Memory Architecture, transforming Ferni from fragmented feature-specific stores into a unified knowledge graph with superhuman recall.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    KNOWLEDGE GRAPH MODULE                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐        │
│  │   Extractors   │  │    Services    │  │    Storage     │        │
│  │                │  │                │  │                │        │
│  │ • LLM Entity   │  │ • Capture      │  │ • Insight      │        │
│  │ • LLM Fact     │  │ • NL Query     │  │ • Thread       │        │
│  │ • LLM Relation │  │                │  │                │        │
│  └────────────────┘  └────────────────┘  └────────────────┘        │
│           │                  │                   │                  │
│           └──────────────────┼───────────────────┘                  │
│                              │                                      │
│                    ┌─────────┴─────────┐                           │
│                    │    Entity Store   │                           │
│                    │  (../entity-store) │                           │
│                    └───────────────────┘                           │
└─────────────────────────────────────────────────────────────────────┘
```

## Key Components

### Extractors (`extractors/`)

LLM-powered extraction from conversation:

| File | Purpose |
|------|---------|
| `llm-entity-extractor.ts` | Extract entities (people, places, events) |
| `llm-fact-extractor.ts` | Extract facts about entities |
| `llm-relationship-extractor.ts` | Extract relationships between entities |

All extractors have rule-based fallbacks for when LLM is unavailable.

### Services (`services/`)

| File | Purpose |
|------|---------|
| `knowledge-capture.ts` | Real-time capture from turn processor |
| `natural-language-query.ts` | "What do we know about X?" queries |

### Storage (`storage/`)

| File | Purpose |
|------|---------|
| `insight-store.ts` | Persist and manage insights |
| `thread-store.ts` | Track conversation arcs across sessions |

## Integration Points

### Turn Processor

The capture service is wired into `turn-processor.ts`:

```typescript
// In turn processor - fires after each user turn
safeFireAndForget(async () => {
  const { captureTurn } = await import('../../memory/knowledge-graph/index.js');
  await captureTurn({
    userId,
    sessionId,
    turnNumber,
    transcript: userText,
    emotion,
    topic,
  });
}, { context: 'knowledge-graph-capture' });
```

### Context Builder

`knowledge-graph-context.ts` injects entity context into LLM:

```typescript
// Provides to LLM:
// - [PEOPLE IN USER'S LIFE] - entities with facts
// - [PATTERNS YOU'VE NOTICED] - detected correlations
// - [PROACTIVE MEMORY] - surfacing opportunities
```

### Background Jobs

`knowledge-graph-jobs.ts` provides scheduled maintenance:

| Job | Schedule | Purpose |
|-----|----------|---------|
| `InsightGenerationJob` | Daily | Generate patterns/correlations |
| `ConsolidationJob` | Daily | Merge duplicates, cleanup |
| `ThreadMaintenanceJob` | Daily | Mark dormant threads |
| `EntityDecayJob` | Daily | Apply memory decay |

## Usage

### Capture Knowledge

```typescript
import { captureTurn } from './memory/knowledge-graph/index.js';

await captureTurn({
  userId: 'user123',
  sessionId: 'session456',
  turnNumber: 1,
  transcript: 'My brother Mike is having surgery next week',
  emotion: { primary: 'worried', intensity: 0.7 },
});
```

### Query Knowledge

```typescript
import { executeNaturalQuery } from './memory/knowledge-graph/index.js';

const result = await executeNaturalQuery(
  'user123',
  'What do we know about Mike?'
);

// result.formattedResponse contains human-readable summary
// result.entity, result.facts, result.relationships contain structured data
```

### Manage Insights

```typescript
import { createInsight, getInsightsReadyToSurface } from './memory/knowledge-graph/index.js';

// Create insight
await createInsight(userId, {
  insightType: 'behavioral_pattern',
  title: 'Monday stress',
  description: 'You tend to feel stressed on Mondays',
  confidence: 0.8,
  salience: 0.7,
  // ...
});

// Get insights ready to surface
const insights = await getInsightsReadyToSurface(userId, {
  types: ['behavioral_pattern', 'temporal_pattern'],
  minSalience: 0.5,
});
```

### Manage Threads

```typescript
import { findOrCreateThread, addOpenQuestion } from './memory/knowledge-graph/index.js';

// Track conversation arc
const thread = await findOrCreateThread(userId, "Mom's health", {
  sessionId,
  date: new Date(),
  summary: 'Discussed doctor appointment',
  emotionalArc: 'concerned',
  keyMoments: ['Appointment is Tuesday'],
  turnRange: [1, 10],
});

// Add open loop
await addOpenQuestion(userId, thread.id, 'Should we offer to drive her?');
```

## Query Types

The NL query system supports:

| Query Type | Example |
|------------|---------|
| `entity_profile` | "What do we know about Mike?" |
| `temporal` | "When did I last talk about mom?" |
| `pattern` | "What patterns have you noticed?" |
| `relationship` | "How is Mike connected to Sarah?" |
| `open_loops` | "What did we not finish discussing?" |
| `insights` | "What insights do you have?" |
| `timeline` | "Show me the timeline for X" |

## Testing

```bash
# Run E2E tests
pnpm vitest run src/memory/knowledge-graph/__tests__/knowledge-graph-e2e.test.ts

# Run all knowledge graph tests
pnpm vitest run knowledge-graph
```

## File Structure

```
src/memory/knowledge-graph/
├── index.ts                    # Main exports
├── types.ts                    # Type definitions
├── integration.ts              # Legacy system integration
├── proactive-surfacing.ts      # Proactive memory surfacing
├── consolidation.ts            # Memory consolidation
│
├── extractors/
│   ├── index.ts
│   ├── llm-entity-extractor.ts
│   ├── llm-fact-extractor.ts
│   └── llm-relationship-extractor.ts
│
├── services/
│   ├── index.ts
│   ├── knowledge-capture.ts    # Turn capture pipeline
│   └── natural-language-query.ts
│
├── storage/
│   ├── index.ts
│   ├── insight-store.ts
│   └── thread-store.ts
│
└── __tests__/
    └── knowledge-graph-e2e.test.ts
```

## Relationship to Entity Store

This module builds ON TOP of `entity-store/`:

- **Entity Store**: CRUD for entities, mentions, relationships
- **Knowledge Graph**: Extraction, queries, insights, threads

The entity store is the persistence layer; knowledge graph is the intelligence layer.

## Key Principles

1. **Entity-Centric**: Everything revolves around entities (people, places, events)
2. **Temporal**: Track when things happened, how they evolved
3. **Proactive**: Surface relevant memories at the right moment
4. **Learnable**: Detect patterns, correlations, insights
5. **Non-Blocking**: Extraction runs async, doesn't slow conversation

## See Also

- Architecture doc: `docs/architecture/UNIFIED-MEMORY-ARCHITECTURE.md`
- Entity store: `src/memory/entity-store/CLAUDE.md`
- Context builder: `src/intelligence/context-builders/memory/knowledge-graph-context.ts`
- Background jobs: `src/tasks/scheduled/knowledge-graph-jobs.ts`
