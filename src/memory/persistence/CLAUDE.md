# Persistence Module

Unified access layer for all memory storage operations.

## Quick Start

```typescript
import { 
  saveDocument, 
  getDocument, 
  searchVectors,
  getPersistenceHealth 
} from './memory/persistence/index.js';

// Document operations
await saveDocument(userId, 'preferences', 'theme', { dark: true });
const pref = await getDocument(userId, 'preferences', 'theme');

// Vector operations
await addVectorDocument('doc-1', 'Some text', { source: 'conversation' });
const results = await searchVectors('similar query', { topK: 5 });

// Health check
const health = await getPersistenceHealth();
```

## Architecture

```
┌─────────────────────────────────────────────────┐
│              Unified Persistence                │
│                (this module)                    │
├─────────────────────────────────────────────────┤
│                                                 │
│  ┌──────────┐ ┌──────────┐ ┌─────────────────┐ │
│  │ Firestore│ │  Vector  │ │      Redis      │ │
│  │  Store   │ │  Store   │ │     (cache)     │ │
│  └──────────┘ └──────────┘ └─────────────────┘ │
│        │            │              │           │
│        └────────────┼──────────────┘           │
│                     │                          │
│              ┌──────▼──────┐                   │
│              │  Entity     │                   │
│              │   Store     │                   │
│              └─────────────┘                   │
└─────────────────────────────────────────────────┘
```

## Key Functions

### Store Access

| Function | Purpose |
|----------|---------|
| `getStore()` | Get primary memory store |
| `getFirestore()` | Get Firestore instance |
| `getVectorStore()` | Get vector store |
| `getRedisCache()` | Get Redis cache (if enabled) |

### Document Operations

| Function | Purpose |
|----------|---------|
| `saveDocument()` | Save to user's collection |
| `getDocument()` | Get from user's collection |
| `deleteDocument()` | Delete from user's collection |
| `queryDocuments()` | Query user's documents |

### Vector Operations

| Function | Purpose |
|----------|---------|
| `addVectorDocument()` | Add document with embedding |
| `searchVectors()` | Semantic similarity search |

### Extended Persistence

| Function | Purpose |
|----------|---------|
| `saveSessionState()` | Persist session state |
| `getSessionState()` | Retrieve session state |
| `savePersonaBond()` | Save user-persona relationship |
| `saveVoiceProfile()` | Save voice enrollment |

## Health Check

```typescript
const health = await getPersistenceHealth();
// {
//   firestore: { healthy: true },
//   vectorStore: { healthy: true, usingFallback: false, cacheSize: 1500 },
//   redis: { enabled: true, healthy: true }
// }
```

## Re-exports

This module re-exports from:
- `firestore-store.ts` - Firestore operations
- `postgres-store.ts` - Postgres operations  
- `in-memory-store.ts` - In-memory store (dev)
- `firestore-vector-store/` - Vector embeddings
- `firestore-extended-persistence.ts` - Extended session data

## Usage Notes

- Firestore is the primary persistent store
- Vector store handles semantic search embeddings
- Redis is optional caching layer
- All document ops are scoped to user's subcollection
