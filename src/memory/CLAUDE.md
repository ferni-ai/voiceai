# Memory System

> **We believe in making AI human, and the decisions we make will reflect that.**

The memory module provides persistent storage for user data, memories, and embeddings. Memory is what makes Ferni remember - and remembering is what makes relationships feel real. See `../../CORE-PRINCIPLES.md` for our complete philosophy.

---

## Architecture Level

Memory is at **Level 30** (Infrastructure layer):

```
Level 100: agents/, api/
Level 70:  personas/, intelligence/, tools/, conversation/, speech/
Level 60:  services/
Level 30:  memory/          ← THIS LAYER
Level 10:  config/, utils/, types/
```

**Import rules:** Memory can only import from config, utils, types. Higher layers import from memory.

---

## Directory Structure

```
memory/
├── __tests__/                    # Test files
├── interfaces/                   # Clean architecture interfaces
│   └── index.ts                  # VectorStoreContract, MemoryDecayService, etc.
├── user-memory-indexer/          # User memory vectorization (modular)
│   ├── index.ts                  # Main entry point
│   ├── types.ts                  # Types and doc ID generation
│   ├── profile-indexers.ts       # Profile data indexers
│   └── human-memory-indexers.ts  # Human-centric memory indexers
├── firestore-store.ts            # Firestore document storage
├── firestore-vector-store.ts     # Vector embeddings in Firestore
├── firestore-memory-persistence.ts # Memory persistence helpers
├── firestore-converters-integration.ts # Type converters
├── embeddings.ts                 # Embedding generation (OpenAI)
├── embedding-cache.ts            # Embedding cache layer
├── advanced-retrieval.ts         # Semantic search with RAG
├── associative-memory.ts         # Memory associations
├── emotional-memory-unified.ts   # Emotion-tagged memories (uses DI)
├── emotional-threading.ts        # Emotional context threads
├── behavioral-pattern-detector.ts # Pattern detection
├── communication-preferences.ts  # User preferences
├── human-signal-extractor.ts     # Extract signals from conversation
├── history.ts                    # Conversation history
├── in-memory-store.ts            # Fast in-memory cache
├── background-indexer.ts         # Async indexing
├── result.ts                     # Result type for error handling
├── type-guards.ts                # Runtime type validation
├── store.ts                      # Abstract MemoryStore base class
├── store-factory.ts              # Store factory (Firestore/Postgres/in-memory)
└── index.ts                      # Main exports
```

---

## Core Components

### 1. Firestore Store

**File:** `firestore-store.ts`

Document storage for structured data.

```typescript
import { getUserDocument, setUserDocument } from './firestore-store.js';

// Read
const profile = await getUserDocument<UserProfile>(userId, 'profile');

// Write
await setUserDocument(userId, 'profile', { name: 'John', ... });
```

### 2. Vector Store

**File:** `firestore-vector-store.ts`

Semantic search using vector embeddings.

```typescript
import { addMemory, searchMemories } from './firestore-vector-store.js';

// Store with embedding
await addMemory(userId, {
  content: 'User mentioned they love hiking',
  type: 'preference',
  embedding: await generateEmbedding(content),
});

// Semantic search
const memories = await searchMemories(userId, {
  query: 'outdoor activities',
  limit: 5,
  threshold: 0.7,
});
```

### 3. Embeddings

**File:** `embeddings.ts`

Generate embeddings via OpenAI.

```typescript
import { generateEmbedding, generateEmbeddings } from './embeddings.js';

const embedding = await generateEmbedding('User loves hiking');
const embeddings = await generateEmbeddings(['hiking', 'mountains', 'outdoors']);
```

### 4. Advanced Retrieval

**File:** `advanced-retrieval.ts`

RAG-style retrieval with context.

```typescript
import { retrieveRelevantContext } from './advanced-retrieval.js';

const context = await retrieveRelevantContext(userId, {
  query: 'What are their hobbies?',
  includeEmotional: true,
  timeWindow: '30d',
});
```

---

## Memory Types

| Type | Purpose | Storage |
|------|---------|---------|
| **Facts** | User preferences, history | Firestore docs |
| **Memories** | Conversation memories | Vector store |
| **Patterns** | Behavioral patterns | Firestore |
| **Emotions** | Emotional context | Vector store |
| **Preferences** | Communication style | Firestore |

---

## Caching Strategy

### Embedding Cache

**File:** `embedding-cache.ts`

Caches embeddings to reduce API calls.

```typescript
import { getCachedEmbedding, cacheEmbedding } from './embedding-cache.js';

// Check cache first
let embedding = getCachedEmbedding(text);
if (!embedding) {
  embedding = await generateEmbedding(text);
  cacheEmbedding(text, embedding);
}
```

### In-Memory Store

**File:** `in-memory-store.ts`

Fast cache for frequently accessed data.

```typescript
import { InMemoryStore } from './in-memory-store.js';

const cache = new InMemoryStore<UserProfile>({ ttlMs: 60000 });
cache.set(userId, profile);
const cached = cache.get(userId);
```

---

## Firestore Schema

### Collections

```
bogle_users/{userId}/
├── profile                  # User profile document
├── memories/                # Memory documents
├── patterns/                # Behavioral patterns
├── commitments/             # Promises/intentions
├── relationships/           # Social network
├── values/                  # Stated/demonstrated values
├── dreams/                  # Long-term aspirations
├── capacity/                # Energy/burnout tracking
├── narrative/               # Life chapters
├── seasonal/                # Seasonal patterns
└── preferences/             # Communication preferences
```

### Memory Document

```typescript
interface MemoryDocument {
  id: string;
  userId: string;
  content: string;
  type: 'fact' | 'preference' | 'event' | 'emotion';
  embedding: number[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
  metadata?: Record<string, unknown>;
}
```

---

## Best Practices

### 1. Graceful Degradation

Always handle missing data gracefully:

```typescript
const profile = await getUserDocument(userId, 'profile');
if (!profile) {
  // Return safe default
  return defaultProfile;
}
```

### 2. Batch Operations

Use batch writes for multiple operations:

```typescript
import { batchWrite } from './firestore-store.js';

await batchWrite(userId, [
  { path: 'memories', data: memory1 },
  { path: 'patterns', data: pattern1 },
]);
```

### 3. Indexing

Index frequently queried fields:

```typescript
// Firestore index in firestore.indexes.json
{
  "collectionGroup": "memories",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "type", "order": "ASCENDING" },
    { "fieldPath": "createdAt", "order": "DESCENDING" }
  ]
}
```

---

## Testing

```bash
# Run memory tests
pnpm vitest run src/memory/__tests__/

# With Firestore emulator
firebase emulators:start --only firestore
FIRESTORE_EMULATOR_HOST=localhost:8080 pnpm vitest run src/memory/
```

---

## Rules

### Do
- Use typed converters for Firestore
- Cache embeddings to reduce costs
- Handle missing data gracefully
- Use batch operations for bulk writes
- Index frequently queried fields

### Don't
- Store sensitive data unencrypted
- Generate embeddings without caching
- Query without limits
- Skip error handling
- Import from higher architecture levels (services, intelligence, conversation, etc.)

---

## Dependency Injection Pattern

To avoid architecture violations, some modules use dependency injection for components from higher layers:

### Emotional Memory Unified

The `emotional-memory-unified.ts` module coordinates user emotion tracking (from intelligence layer) and persona bonding (from conversation layer). To avoid importing from these higher layers:

```typescript
import { configureEmotionalMemoryEngines } from './memory/emotional-memory-unified.js';

// In services/index.ts during initialization:
configureEmotionalMemoryEngines({
  getUserEmotionEngine: (userId) => getEmotionalMemory(userId),
  getBondingEngine: (userId, bond) => getEmotionalMemory(userId, bond),
  removeUserEmotionEngine: (userId) => removeEmotionalMemory(userId),
  clearBondingEngine: (userId) => clearEmotionalMemory(userId),
});
```

### Embedding Cache Metrics

The `embedding-cache.ts` module can report cache metrics to the performance-metrics service:

```typescript
import { configureEmbeddingCacheMetrics } from './memory/embedding-cache.js';
import { recordCacheHit, recordCacheMiss, recordCacheEviction } from '../services/performance-metrics.js';

// In services initialization:
configureEmbeddingCacheMetrics({
  recordCacheHit,
  recordCacheMiss,
  recordCacheEviction,
});
```

---

## Reference Docs

- Firestore: https://firebase.google.com/docs/firestore
- OpenAI Embeddings: https://platform.openai.com/docs/guides/embeddings
- Memory Management: `docs/architecture/MEMORY-MANAGEMENT.md`
- Persistence: `docs/architecture/PERSISTENCE-ARCHITECTURE.md`

---

*Last updated: December 2024*
