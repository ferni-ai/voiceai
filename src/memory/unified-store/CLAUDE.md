# Unified Memory Store

> **Phase 1 of Superhuman Memory Implementation**

Single interface for all memory operations across Firestore, Vector, Redis, and In-Memory stores.

## Quick Start

```typescript
import { getUnifiedStore } from './memory/unified-store';

const store = getUnifiedStore();
await store.initialize();

// Store a memory
const memory = await store.store({
  userId: 'user123',
  type: 'entity',
  content: 'User mentioned loving hiking',
  emotionalWeight: 0.8,
  topics: ['hobbies', 'outdoor'],
});

// Recall memories
const result = await store.recall({
  userId: 'user123',
  query: 'outdoor activities',
  limit: 10,
});

// Get links (graph)
const links = await store.getLinks(userId, memoryId);
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    UnifiedMemoryStoreFacade                  │
│  - Coordinates multiple storage backends                     │
│  - Handles deduplication, embedding generation               │
│  - Provides contextual boosting for recall                   │
└─────────────────────────────────────────────────────────────┘
                              │
      ┌───────────────────────┼───────────────────────┐
      │                       │                       │
      ▼                       ▼                       ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│  Firestore    │   │    Vector     │   │    Redis      │
│   Adapter     │   │   Adapter     │   │   Adapter     │
│               │   │               │   │               │
│ Primary       │   │ Semantic      │   │ Caching       │
│ Persistence   │   │ Search        │   │ Layer         │
└───────────────┘   └───────────────┘   └───────────────┘
                              │
                    ┌─────────┴─────────┐
                    │                   │
                    ▼                   ▼
             ┌───────────────┐   ┌───────────────┐
             │   Memory      │   │    Graph      │
             │   Adapter     │   │   Module      │
             │               │   │               │
             │ Session       │   │ Memory        │
             │ Cache         │   │ Links         │
             └───────────────┘   └───────────────┘
```

## File Structure

```
src/memory/unified-store/
├── index.ts                    # Main exports
├── types.ts                    # Type definitions
├── facade.ts                   # Facade implementation
├── CLAUDE.md                   # This file
├── adapters/
│   ├── index.ts               # Adapter exports
│   ├── firestore-adapter.ts   # Firestore persistence
│   ├── vector-adapter.ts      # Semantic search
│   ├── redis-adapter.ts       # Caching layer
│   └── memory-adapter.ts      # Session cache
├── graph/
│   ├── index.ts               # Graph exports
│   ├── link-types.ts          # Link type definitions & detection rules
│   ├── firestore-links.ts     # Link persistence
│   └── link-manager.ts        # Link orchestration
└── __tests__/
    ├── facade.test.ts         # Facade tests
    └── memory-adapter.test.ts # Memory adapter tests
```

## Storage Backends

| Backend | Purpose | Required |
|---------|---------|----------|
| **Firestore** | Primary persistence | Yes |
| **Vector** | Semantic search (embeddings) | Recommended |
| **Redis** | Caching layer | Optional |
| **Memory** | Session-level cache | Yes (always used) |

## Memory Types

```typescript
type MemoryType =
  | 'entity'      // People, places, things
  | 'fact'        // Extracted facts
  | 'moment'      // Key moments
  | 'commitment'  // Promises, intentions
  | 'preference'  // User preferences
  | 'summary'     // Conversation summaries
  | 'insight'     // Generated insights
  | 'signal'      // Human signals (dreams, fears, values)
  | 'topic';      // Discussion topics
```

## Link Types (Graph)

```typescript
type MemoryLinkType =
  | 'causal'       // "Because of" / "Led to"
  | 'temporal'     // "Before" / "After"
  | 'emotional'    // Similar emotional context
  | 'person'       // Same person mentioned
  | 'topic'        // Same topic domain
  | 'narrative'    // Same life chapter
  | 'semantic'     // High embedding similarity
  | 'reinforced';  // Frequently accessed together
```

## Configuration

```typescript
const config: UnifiedStoreConfig = {
  // Firestore
  firestoreProjectId: process.env.GOOGLE_CLOUD_PROJECT,
  firestoreDatabaseId: '(default)',
  
  // Redis
  redisUrl: process.env.REDIS_URL,
  redisCacheTtl: 3600, // 1 hour
  
  // Embeddings
  embeddingModel: 'text-embedding-3-small',
  embeddingDimension: 1536,
  
  // Deduplication
  enableDeduplication: true,
  deduplicationThreshold: 0.92,
  
  // Auto-linking
  enableAutoLinking: true,
  
  // Decay
  defaultDecayRate: 0.1,
  emotionalDecayMultiplier: 2.0,
  
  // Feature flags
  features: {
    useRedisCache: true,
    useVectorSearch: true,
    useGraphExpansion: true,
    useHybridSearch: true,
  },
};
```

## Key Operations

### Store

```typescript
const memory = await store.store({
  userId: 'user123',
  type: 'entity',
  content: 'User mentioned their brother Mike',
  emotionalWeight: 0.7,
  importance: 0.8,
  topics: ['family'],
  peopleMentioned: ['Mike'],
  isCommitment: false,
});
```

### Recall

```typescript
const result = await store.recall({
  userId: 'user123',
  query: 'family members',
  types: ['entity'],
  limit: 10,
  minScore: 0.5,
  includeLinked: true,
  maxGraphHops: 2,
});
```

### Graph Operations

```typescript
// Get links for a memory
const links = await store.getLinks(userId, memoryId, 'person');

// Add a link manually
const link = await store.addLink(userId, {
  sourceId: 'mem-1',
  targetId: 'mem-2',
  type: 'causal',
  weight: 0.8,
  bidirectional: false,
});

// Reinforce a link (when memories are accessed together)
await store.reinforceLink(userId, linkId);
```

### Lifecycle

```typescript
// Reinforce a memory (accessed/used)
await store.reinforce(userId, memoryId);

// Run consolidation (merge similar, detect patterns)
const consolidationReport = await store.consolidate(userId);

// Run decay (reduce strength over time)
const decayReport = await store.decay(userId);
```

## Health Check

```typescript
const health = await store.health();
// {
//   healthy: true,
//   timestamp: Date,
//   stores: {
//     firestore: { healthy: true, name: 'firestore', initialized: true, latencyMs: 45 },
//     vector: { healthy: true, name: 'vector', initialized: true, latencyMs: 38 },
//     redis: { healthy: true, name: 'redis', initialized: true, latencyMs: 5 },
//     memory: { healthy: true, name: 'memory', initialized: true, latencyMs: 0 },
//   },
//   degraded: false,
// }
```

## Testing

```bash
# Run unified store tests
pnpm vitest run src/memory/unified-store/__tests__/

# Run with coverage
pnpm vitest run src/memory/unified-store/__tests__/ --coverage
```

## Migration from Legacy

```typescript
// BEFORE: Direct calls to multiple systems
import { getUserDocument } from './firestore-store.js';
import { searchMemories } from './firestore-vector-store.js';
import { getCachedEmbedding } from './embedding-cache.js';

// AFTER: Single unified interface
import { getUnifiedStore } from './unified-store/index.js';

const store = getUnifiedStore();
const result = await store.recall({ userId, query });
```

## Roadmap (Superhuman Memory Phases)

| Phase | Status | Description |
|-------|--------|-------------|
| **Phase 1** | ✅ Complete | Unified Memory Store (this module) |
| **Phase 2** | Planned | Memory Intelligence Layer |
| **Phase 3** | Planned | Associative Cortex |
| **Phase 4** | Planned | Learning & Lifecycle |
| **Phase 5** | Planned | Tool Integration |

See `docs/plans/SUPERHUMAN-MEMORY-IMPLEMENTATION-PLAN.md` for full details.
