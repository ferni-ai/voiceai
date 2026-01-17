# Firestore Vector Store Module

Production-grade persistent vector storage using Google Cloud Firestore's native vector search.

## Module Structure

```
firestore-vector-store/
├── index.ts           # Re-exports + singleton factory
├── types.ts           # Interfaces, configs, constants
├── helpers.ts         # Embedding extraction, filter matching
├── fallback-cache.ts  # In-memory fallback when Firestore unavailable
├── recovery.ts        # Recovery manager for auto-reconnection
└── core.ts            # Main FirestoreVectorStore class
```

## Key Features

- **Persistent Storage**: Survives restarts, unlike in-memory VectorStore
- **Native KNN Search**: Uses Firestore's `findNearest()` for vector similarity
- **Automatic Fallback**: Falls back to in-memory cache if Firestore unavailable
- **Recovery System**: Periodic attempts to reconnect to Firestore
- **Cache Migration**: Migrates cached data to Firestore on recovery
- **Request Coalescing**: Deduplicates concurrent identical searches (see below)

## Usage

```typescript
import { getFirestoreVectorStore } from '../memory/firestore-vector-store/index.js';

const vectorStore = getFirestoreVectorStore();
await vectorStore.initialize();

// Add document
await vectorStore.addDocument({
  id: 'doc-1',
  text: 'User mentioned their daughter starting college',
  metadata: { source: 'conversation', userId: 'user-123' }
});

// Semantic search
const results = await vectorStore.search('How is college going?', {
  topK: 5,
  filter: { userId: 'user-123' }
});
```

## Health Monitoring

```typescript
const health = vectorStore.getHealth();
// Returns:
// {
//   healthy: boolean,
//   usingFallback: boolean,
//   fallbackReason: string | null,
//   risk: 'none' | 'data_loss' | 'degraded_search',
//   recoveryAttempts: number,
//   cacheSize: number
// }
```

## Firestore Index Setup

Required composite index (run once per project):

```bash
gcloud firestore indexes composite create \
  --collection-group=vectors \
  --query-scope=COLLECTION \
  --field-config=vector-config='{"dimension":"768","flat":{}}',field-path=embedding
```

## Configuration

| Setting | Default | Environment Variable |
|---------|---------|---------------------|
| Project ID | auto-detected | `GOOGLE_CLOUD_PROJECT` |
| Database ID | `(default)` | `FIRESTORE_DATABASE` |
| Collection | `vectors` | - |
| Dimensions | 768 | - |

## Fallback Mode

When Firestore is unavailable, the store operates in fallback mode:

- **Risk**: `DATA_LOSS_ON_RESTART` - cached data is lost if process exits
- **Recovery**: Automatic attempts every 60 seconds (max 10 attempts)
- **Migration**: Cached documents automatically migrate to Firestore on recovery

## Request Coalescing

The vector store uses request coalescing to prevent duplicate concurrent searches:

```typescript
import { getVectorSearchCoalescerStats } from './core.js';

// Get stats for monitoring
const stats = getVectorSearchCoalescerStats();
// { totalRequests, coalescedRequests, actualExecutions, coalesceRate, errors, currentPending }
```

**How it works:**
- Concurrent searches with identical query + options share one execution
- Results are deep-cloned via `structuredClone` to prevent mutation bugs
- 60-second TTL prevents memory leaks
- Feature flag: Set `ENABLE_VECTOR_COALESCING=false` to disable

**Coalesce key includes:**
- Query text
- topK, minScore
- All filter fields (source, userId, category, timestamps, metadata)

## Import Rules

This module can import from:
- `config/` - Configuration utilities
- `utils/` - Logger, firestore-utils, request-coalescer
- `../embeddings.js` - Embedding generation
- `../vector-store-interface.js` - Contract types

## Testing

```bash
pnpm vitest run src/memory/__tests__/firestore-vector-store.test.ts
```

