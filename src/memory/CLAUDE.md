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

## 🏗️ Clean Architecture (January 2026 Refactor)

The memory module follows clean architecture with **six** focused entry points:

### **RECOMMENDED: Use the Memory Facade**

```typescript
import { Memory } from './memory/facade.js';

// Initialize at startup
await Memory.initialize();

// Capture from conversation
await Memory.capture({ userId, sessionId, transcript, turnNumber });

// Retrieve context
const context = await Memory.retrieve(userId, query);

// Ask natural language questions
const { answer, entities } = await Memory.ask(userId, 'What do we know about Mike?');

// Health check
const healthy = await Memory.isHealthy();
```

The `Memory` facade provides the cleanest, most stable API for new code.

---

### Individual Entry Points

### 1. Unified Capture (`capture/`)

**Single entry point for all memory capture operations.**

```typescript
import { captureTurnUnified } from './memory/capture/index.js';

// Capture memory from a conversation turn
const result = await captureTurnUnified({
  userId,
  sessionId,
  turnNumber,
  transcript: userText,
  emotion: { primary: 'happy', intensity: 0.8 },
  personaId: 'ferni',
});

// Result includes:
// - fast: Fast regex extraction results
// - stmRecorded: Whether STM buffer was updated
// - entities: Captured person entities
// - asyncJobId: For tracking deep extraction
```

**What it does:**
1. Runs `fastCapture()` inline (< 50ms regex extraction)
2. Records to STM buffer (L1 memory)
3. Captures person entities to entity-store
4. Queues async deep extraction

### 2. Unified Persistence (`persistence/`)

**Single access point for all storage operations.**

```typescript
import {
  getUnifiedStore,
  saveDocument,
  getDocument,
  searchVectors,
  getPersistenceHealth,
} from './memory/persistence/index.js';

// Save a document
await saveDocument(userId, 'memories', 'mem-123', { content: '...' });

// Get a document
const doc = await getDocument(userId, 'memories', 'mem-123');

// Semantic search
const results = await searchVectors('outdoor activities', { topK: 5 });

// Health check
const health = await getPersistenceHealth();
```

**What it abstracts:**
- Firestore (primary document store)
- FirestoreVectorStore (embeddings)
- Redis (optional cache)
- Spanner (L3 graph storage)

### 3. Interfaces (`interfaces/`)

**Canonical import point for all memory types.**

```typescript
import type {
  // Entity types (from entity-store)
  Entity,
  EntityType,
  PersonAttributes,
  // Knowledge graph types
  Relationship,
  Fact,
  Correlation,
  // Service interfaces
  MemoryOrchestrator,
  VectorStoreContract,
} from './memory/interfaces/index.js';
```

---

## Directory Structure

```
memory/
├── CLAUDE.md                     # This file
├── facade.ts                     # 🌟 RECOMMENDED: Memory facade API
├── index.ts                      # Main exports (all modules)
├── interfaces/                   # Clean architecture interfaces
│   └── index.ts                  # Canonical type import point
│
├── capture/                      # 🆕 Unified capture pipeline
│   └── index.ts                  # captureTurnUnified()
│
├── retrieval/                    # 🆕 Unified retrieval layer
│   └── index.ts                  # retrieveContext(), search
│
├── persistence/                  # 🆕 Unified storage layer
│   └── index.ts                  # saveDocument(), searchVectors()
│
├── init/                         # 🆕 Initialization & health
│   └── index.ts                  # initialize(), shutdown(), health
│
├── entity-store/                 # Unified entity storage (BTH memory)
│   ├── types.ts                  # Source of truth for entity types
│   ├── storage.ts                # Firestore CRUD
│   ├── entity-resolver.ts        # Resolve mentions to entities
│   ├── integration.ts            # capturePersonEntity()
│   └── migration.ts              # Legacy data migration
│
├── knowledge-graph/              # Graph intelligence layer
│   ├── types.ts                  # Graph types (extends entity-store)
│   ├── extractors/               # LLM entity/fact/relationship extraction
│   ├── services/                 # Knowledge capture, NL query
│   └── storage/                  # Insights, threads
│
├── dynamic/                      # Three-layer memory (L1/L2/L3)
│   ├── fast-capture.ts           # L2: Regex extraction (< 50ms)
│   ├── stm-buffer.ts             # L1: In-memory session context
│   ├── stm-promotion.ts          # L1→L2: Session-end promotion
│   ├── deep-extraction-worker.ts # L3: Async LLM extraction
│   └── firestore-spanner-sync.ts # L2→L3: Background sync
│
├── spanner-graph/                # L3 long-term graph storage
│   ├── schema.ts                 # DDL and types
│   ├── client.ts                 # Spanner client
│   └── queries.ts                # GQL graph queries
│
├── firestore-vector-store/       # Vector embeddings (modular)
│   ├── core.ts                   # Main class
│   ├── fallback-cache.ts         # In-memory fallback
│   └── recovery.ts               # Auto-recovery
│
├── Memory Graph & Lifecycle      # Human-like memory operations
│   ├── memory-graph.ts           # Associative links
│   ├── spreading-activation.ts   # Graph traversal
│   ├── protection-engine.ts      # Protect important memories
│   ├── lifecycle-integration.ts  # Bridge to storage
│   └── learning-engine.ts        # Adapt to user reactions
│
└── Core Stores
    ├── firestore-store.ts        # Firestore document store
    ├── postgres-store.ts         # PostgreSQL store
    ├── in-memory-store.ts        # Development store
    ├── redis-cache.ts            # Session cache
    └── store-factory.ts          # Auto-select store
```

---

## Three-Layer Memory Architecture

```
User Speech
    │
    ▼
┌──────────────────────┐
│   Fast Capture       │  < 50ms (inline)
│   (fast-capture.ts)  │
└────────┬─────────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
┌────────┐  ┌────────────────────┐
│  STM   │  │  AsyncEvents.emit  │
│ Buffer │  │  (fire & forget)   │
│  (L1)  │  └────────┬───────────┘
└────────┘           │
                     ▼
           ┌──────────────────────┐
           │  Deep Extraction     │  Background (1-3s)
           │  Worker              │
           └──────────┬───────────┘
                      │
                      ▼
           ┌──────────────────────┐
           │  Firestore (L2)      │
           │  Entity Store        │
           └──────────┬───────────┘
                      │
                      ▼ (Background sync, every 6h)
           ┌──────────────────────┐
           │  Spanner Graph (L3)  │
           └──────────────────────┘
```

| Layer | Storage | Latency | TTL | Purpose |
|-------|---------|---------|-----|---------|
| **L1: STM** | In-memory | < 1ms | Session | Current conversation context |
| **L2: Working** | Firestore | 50-150ms | 7-30 days | Recent entities, facts |
| **L3: Long-Term** | Spanner | 100-200ms | Forever | Relationship traversal |

---

## Key Modules

### Entity Store (Better Than Human Memory)

Unified storage for all entities (people, places, events, concepts).

```typescript
import {
  capturePersonEntity,
  findContactForTelephony,
  whatDoWeKnowAbout,
} from './memory/entity-store/index.js';

// Capture a person from conversation
const result = await capturePersonEntity(userId, {
  name: 'Mike',
  relationship: 'brother',
  phone: '555-1234',
}, context);

// Find contact for calling
const contact = await findContactForTelephony(userId, 'my brother');

// Get everything about someone
const info = await whatDoWeKnowAbout(userId, 'Mike');
```

### Knowledge Graph

Graph intelligence layer for extraction and querying.

```typescript
import {
  captureTurn,
  executeNaturalQuery,
  getKnowledgeGraph,
} from './memory/knowledge-graph/index.js';

// Capture knowledge from turn
await captureTurn({
  userId,
  sessionId,
  turnNumber,
  transcript: 'My brother Mike is having surgery',
  emotion: { primary: 'worried' },
});

// Natural language query
const result = await executeNaturalQuery(userId, 'What do we know about Mike?');
```

### Memory Graph & Lifecycle

Human-like memory operations.

```typescript
import {
  getMemoryGraph,
  getSpreadingActivation,
  getLearningEngine,
  runLifecycleMaintenance,
} from './memory/index.js';

// Spreading activation (like human memory recall)
const activation = await getSpreadingActivation();
const activated = await activation.spread(memoryId);

// Learn from user reactions
const learning = getLearningEngine();
await learning.recordReaction(surfacingEvent, 'grateful');
```

---

## System Health Monitoring

```typescript
import { getMemorySystemHealth } from './memory/index.js';

const health = await getMemorySystemHealth();
// Returns:
// {
//   overall: 'healthy' | 'degraded' | 'unhealthy',
//   initialized: boolean,
//   stores: {
//     primary: { healthy: boolean, type: StoreType },
//     vector: { healthy: boolean, usingFallback: boolean, cacheSize: number },
//     redis: { enabled: boolean, healthy: boolean }
//   },
//   embedding: { provider: string, dimensions: number, dimensionMatch: boolean }
// }
```

---

## Testing

```bash
# Run all memory tests
pnpm vitest run src/memory/

# Run with Firestore emulator
firebase emulators:start --only firestore
FIRESTORE_EMULATOR_HOST=localhost:8080 pnpm vitest run src/memory/

# Run specific modules
pnpm vitest run src/memory/entity-store/
pnpm vitest run src/memory/knowledge-graph/
pnpm vitest run src/memory/dynamic/
```

---

## Rules

### Do

- Use typed converters for Firestore
- Cache embeddings to reduce costs
- Handle missing data gracefully
- Use batch operations for bulk writes
- Index frequently queried fields
- Use `captureTurnUnified()` for new capture code
- Import types from `interfaces/index.ts`

### Don't

- Store sensitive data unencrypted
- Generate embeddings without caching
- Query without limits
- Skip error handling
- Import from higher architecture levels
- Bypass unified capture/persistence layers
- Directly access internal modules (use facades)

---

## Migration Guide

### Updating from Legacy Imports

**Before (direct imports):**
```typescript
import { fastCapture } from './memory/dynamic/fast-capture.js';
import { capturePersonEntity } from './memory/entity-store/integration.js';
import { recordTurn } from './memory/dynamic/stm-buffer.js';
```

**After (unified capture):**
```typescript
import { captureTurnUnified } from './memory/capture/index.js';

// One function handles all capture
const result = await captureTurnUnified(input);
```

**Before (multiple store access):**
```typescript
import { getFirestoreStore } from './memory/firestore-store.js';
import { getFirestoreVectorStore } from './memory/firestore-vector-store.js';
```

**After (unified persistence):**
```typescript
import {
  getUnifiedStore,
  getUnifiedVectorStore,
  saveDocument,
  searchVectors,
} from './memory/persistence/index.js';
```

---

## Reference Docs

- Firestore: https://firebase.google.com/docs/firestore
- OpenAI Embeddings: https://platform.openai.com/docs/guides/embeddings
- Memory Management: `docs/architecture/MEMORY-MANAGEMENT.md`
- Dynamic Memory: `docs/architecture/DYNAMIC-MEMORY-ARCHITECTURE.md`
- Entity Store: `src/memory/entity-store/CLAUDE.md`
- Knowledge Graph: `src/memory/knowledge-graph/CLAUDE.md`

---

*Last updated: January 2026 (Clean Architecture Refactor)*
