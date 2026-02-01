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
Level 30:  memory/          <- THIS LAYER
Level 10:  config/, utils/, types/
```

**Import rules:** Memory can only import from config, utils, types. Higher layers import from memory.

---

## Directory Structure

```
memory/
├── __tests__/                    # Unit tests
├── interfaces/                   # Clean architecture interfaces
│   └── index.ts                  # VectorStoreContract, MemoryDecayService, etc.
│
├── # SPECIALIZED SUBSYSTEMS (each has CLAUDE.md) ────────────────────
│
├── dynamic/                      # Three-layer memory (L1/L2/L3)
│   ├── CLAUDE.md                 # Full documentation
│   ├── fast-capture.ts           # Real-time extraction (<50ms)
│   ├── stm-buffer.ts             # L1 in-memory session context
│   ├── deep-extraction-worker.ts # Async LLM extraction (Gemini)
│   ├── stm-promotion.ts          # Session-end promotion to L2
│   ├── firestore-spanner-sync.ts # Background sync to L3
│   └── metrics.ts                # Observability
│
├── knowledge-graph/              # Entity relationship graph
│   ├── CLAUDE.md                 # Full documentation
│   ├── storage/                  # Graph persistence
│   ├── extractors/               # Entity extraction
│   └── services/                 # Graph services
│
├── entity-store/                 # Typed entity persistence
│   ├── CLAUDE.md                 # Full documentation
│   └── index.ts                  # Entity CRUD operations
│
├── spanner-graph/                # L3 long-term relationship graph
│   ├── CLAUDE.md                 # Full documentation
│   └── ...                       # Spanner integration
│
├── retrieval/                    # Memory retrieval strategies
│   ├── CLAUDE.md                 # Full documentation
│   ├── turn-memory-retrieval.ts  # Per-turn memory fetching
│   └── memory-feedback.ts        # Relevance feedback
│
├── capture/                      # Real-time memory capture
│   ├── CLAUDE.md                 # Full documentation
│   ├── active-listening-capture.ts # Capture during speech
│   └── index.ts                  # Capture orchestration
│
├── firestore-vector-store/       # Vector embeddings in Firestore
│   ├── CLAUDE.md                 # Full documentation
│   ├── core.ts                   # Main FirestoreVectorStore class
│   ├── types.ts                  # Interfaces, configs, constants
│   ├── helpers.ts                # Embedding extraction, filter matching
│   ├── fallback-cache.ts         # In-memory fallback
│   ├── recovery.ts               # Auto-recovery, cache migration
│   └── index.ts                  # Re-exports + singleton
│
├── cross-persona/                # Shared memory across personas
│   ├── persona-memory-context.ts # Cross-persona context
│   ├── shared-memory-api.ts      # API for persona sharing
│   └── index.ts                  # Re-exports
│
├── emotional/                    # Emotional memory subsystem
│   └── ...                       # Emotion-tagged memories
│
├── # ROOT-LEVEL MODULES ─────────────────────────────────────────────
│
├── # Storage Backends
├── firestore-store.ts            # Firestore document storage
├── firestore-factory.ts          # Firestore client factory
├── postgres-store.ts             # PostgreSQL storage
├── redis-cache.ts                # Redis caching layer
├── store.ts                      # Abstract MemoryStore base
├── store-factory.ts              # Store factory (Firestore/Postgres/in-memory)
├── in-memory-store.ts            # Fast in-memory cache
│
├── # Embeddings & Vector Search
├── embeddings.ts                 # Embedding generation (OpenAI)
├── embedding-cache.ts            # Embedding cache layer
├── firestore-vector-store.ts     # Re-exports from modular firestore-vector-store/
├── vector-store.ts               # Vector store utilities
├── vector-store-interface.ts     # Vector store contracts
│
├── # Retrieval & Search
├── advanced-retrieval.ts         # RAG-style semantic search
├── semantic-rag.ts               # Semantic RAG retrieval
├── semantic-memory-cache.ts      # Semantic search caching
├── key-moment-retrieval.ts       # Key moment extraction
├── retrieval-explanations.ts     # Explainable retrieval
├── parallel-memory-search.ts     # Parallel search execution
├── session-priming.ts            # Session context priming
├── predictive-cache-warming.ts   # Predictive cache warming
├── spreading-activation.ts       # Activation spreading algorithm
│
├── # Memory Operations
├── memory-consolidator.ts        # Memory consolidation
├── memory-decay.ts               # Graceful forgetting
├── memory-deduplication.ts       # Duplicate removal
├── memory-graph.ts               # Memory graph operations
├── memory-lifecycle.ts           # Memory lifecycle management
├── memory-metrics.ts             # Memory observability
├── lsh-deduplication.ts          # LSH-based deduplication
├── summarizer.ts                 # Memory summarization
├── orchestrator.ts               # Memory operation orchestration
│
├── # Signal Extraction
├── human-signal-extractor.ts     # Extract signals from conversation
├── llm-signal-extractor.ts       # LLM-based signal extraction
├── llm-link-detector.ts          # Link detection in conversation
├── superhuman-signal-router.ts   # Route superhuman signals
│
├── # Emotional & Behavioral
├── emotional-memory-unified.ts   # Emotion-tagged memories (DI)
├── emotional-threading.ts        # Emotional context threads
├── behavioral-pattern-detector.ts # Pattern detection
├── communication-preferences.ts  # User preferences
├── associative-memory.ts         # Memory associations
├── pattern-formation.ts          # Pattern formation
├── natural-reference-generator.ts # Natural reference generation
│
├── # Performance & Optimization
├── rust-accelerator.ts           # Rust-accelerated operations
├── speculative-embeddings.ts     # Speculative embedding generation
├── performance-limits.ts         # Performance boundaries
├── protection-engine.ts          # Memory protection
├── learning-engine.ts            # Memory learning
│
├── # User Memory
├── user-memory-indexer.ts        # User memory vectorization (single file)
├── background-indexer.ts         # Async indexing
│
├── # Persistence & Converters
├── firestore-memory-persistence.ts # Memory persistence helpers
├── firestore-extended-persistence.ts # Extended persistence
├── lifecycle-integration.ts      # Lifecycle integration
│
├── # Utilities
├── result.ts                     # Result type for error handling
├── type-guards.ts                # Runtime type validation
└── index.ts                      # Main exports
```

---

## System Health Monitoring

**Function:** `getMemorySystemHealth()`

Returns unified health status for all memory subsystems:

```typescript
import { getMemorySystemHealth, type MemorySystemHealth } from './memory/index.js';

const health = await getMemorySystemHealth();
// Returns:
// {
//   overall: 'healthy' | 'degraded' | 'unhealthy',
//   initialized: boolean,
//   stores: {
//     primary: { healthy: boolean, type: StoreType, details?: string },
//     vector: { healthy: boolean, usingFallback: boolean, cacheSize: number },
//     redis: { enabled: boolean, healthy: boolean, details?: string }
//   },
//   embedding: {
//     provider: string,
//     dimensions: number,
//     dimensionMatch: boolean
//   }
// }
```

**Health States:**
- `healthy`: All systems operational
- `degraded`: Operating in fallback mode (e.g., in-memory cache instead of Firestore)
- `unhealthy`: Critical failure, memory system not initialized

---

## Three-Layer Memory Architecture (Dynamic Memory)

See `dynamic/CLAUDE.md` for full details.

```
User Speech -> fastCapture() -> STM Buffer (L1) -> onSessionEnd() -> Firestore (L2)
                    |                                                    |
                    +-> AsyncEvents -> DeepExtractionWorker -> Firestore-+
                                                                         |
                                                              Background Sync
                                                                         |
                                                              Spanner Graph (L3)
```

| Layer | Storage | Latency | Purpose |
|-------|---------|---------|---------|
| **L1: STM** | In-memory | < 1ms | Current session context |
| **L2: Working** | Firestore | 50-150ms | Recent entities, facts |
| **L3: Long-Term** | Spanner | 100-200ms | Relationship graph |

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
| **Entities** | People, places, things | Knowledge graph |
| **Relationships** | Entity connections | Spanner graph |

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
├── preferences/             # Communication preferences
├── entities/                # Extracted entities (people, places)
└── entity_relationships/    # Entity connections
```

---

## Subsystem CLAUDE.md Files

Each specialized subsystem has its own documentation:

| Subsystem | CLAUDE.md | Purpose |
|-----------|-----------|---------|
| `dynamic/` | Yes | Three-layer memory (L1/L2/L3) |
| `knowledge-graph/` | Yes | Entity relationship graph |
| `entity-store/` | Yes | Typed entity persistence |
| `spanner-graph/` | Yes | Long-term relationship graph |
| `retrieval/` | Yes | Memory retrieval strategies |
| `capture/` | Yes | Real-time memory capture |
| `firestore-vector-store/` | Yes | Vector embeddings |

---

## Testing

```bash
# Run memory tests
pnpm vitest run src/memory/__tests__/

# With Firestore emulator
firebase emulators:start --only firestore
FIRESTORE_EMULATOR_HOST=localhost:8080 pnpm vitest run src/memory/

# Dynamic memory tests
pnpm vitest run src/memory/dynamic/__tests__/
```

---

## Rules

### Do
- Use typed converters for Firestore
- Cache embeddings to reduce costs
- Handle missing data gracefully
- Use batch operations for bulk writes
- Index frequently queried fields
- Use dynamic memory for real-time capture

### Don't
- Store sensitive data unencrypted
- Generate embeddings without caching
- Query without limits
- Skip error handling
- Import from higher architecture levels (services, intelligence, conversation, etc.)

---

## Reference Docs

- Firestore: https://firebase.google.com/docs/firestore
- OpenAI Embeddings: https://platform.openai.com/docs/guides/embeddings
- Memory Management: `docs/architecture/MEMORY-MANAGEMENT.md`
- Dynamic Memory: `src/memory/dynamic/CLAUDE.md`
- Knowledge Graph: `src/memory/knowledge-graph/CLAUDE.md`

---

*Last updated: January 2026*
