# Phase 1: Unified Memory Store - Implementation Plan

> **Weeks 1-2 | Foundation for Superhuman Memory**

---

## Executive Summary

Phase 1 creates a **single unified interface** to all memory storage systems. This is the foundation that all other phases build upon. No other phase can proceed without this.

---

## Goals

1. ✅ Single API for all memory operations
2. ✅ Adapters for Firestore, Vector Store, and Cache
3. ✅ Graph link storage (ready for Phase 3)
4. ✅ Zero-downtime migration path
5. ✅ >80% test coverage

---

## Week 1: Core Implementation

### Day 1-2: Types & Interfaces

**Create:** `src/memory/unified-store/types.ts`

```typescript
// Core types for the unified memory store
// See deep-dive 01-UNIFIED-MEMORY-STORE.md for full spec
```

**Tasks:**
- [ ] Define `MemoryInput` interface
- [ ] Define `StoredMemory` interface  
- [ ] Define `RecallQuery` interface
- [ ] Define `RecallResult` interface
- [ ] Define `UnifiedMemoryStore` interface (main API)
- [ ] Define `MemoryType` enum
- [ ] Add JSDoc for all public types

**Create:** `src/memory/unified-store/adapters/types.ts`

**Tasks:**
- [ ] Define `StorageAdapter` base interface
- [ ] Define `DocumentAdapter` interface (Firestore)
- [ ] Define `VectorAdapter` interface (Vector Store)
- [ ] Define `CacheAdapter` interface (Redis + Memory)
- [ ] Define `QueryFilter`, `BatchOperation` types

---

### Day 2-3: Adapters

**Create:** `src/memory/unified-store/adapters/firestore-adapter.ts`

**Tasks:**
- [ ] Implement `FirestoreDocumentAdapter` class
- [ ] Lazy initialization (don't require Firestore at import)
- [ ] CRUD operations: `get`, `set`, `update`, `delete`
- [ ] Query support with filters
- [ ] Batch write support
- [ ] Health check method
- [ ] Clean shutdown method
- [ ] Use existing `cleanForFirestore` utility

**Create:** `src/memory/unified-store/adapters/vector-adapter.ts`

**Tasks:**
- [ ] Implement `FirestoreVectorAdapter` class
- [ ] Wrap existing vector store from `src/memory/firestore-vector-store/`
- [ ] `store()` - add document with embedding
- [ ] `search()` - semantic search with filters
- [ ] `delete()` - remove document
- [ ] Handle embedding format conversion if needed

**Create:** `src/memory/unified-store/adapters/cache-adapter.ts`

**Tasks:**
- [ ] Implement `TieredCacheAdapter` class
- [ ] L1: In-memory Map with TTL
- [ ] L2: Optional Redis (graceful degradation)
- [ ] `get`/`set`/`delete` with automatic tiering
- [ ] `mget`/`mset` for batch operations
- [ ] `invalidatePattern` for cache busting
- [ ] LRU eviction for L1 when at capacity
- [ ] Stats reporting

---

### Day 3-4: Facade Implementation

**Create:** `src/memory/unified-store/facade.ts`

**Tasks:**
- [ ] Implement `UnifiedMemoryStoreFacade` class
- [ ] Constructor accepting all three adapters
- [ ] `store()` - generate embedding if needed, store to all systems
- [ ] `recall()` - search vector, fetch full docs, apply scoring
- [ ] `update()` - update doc, re-embed if content changed
- [ ] `delete()` - remove from all systems
- [ ] `get()` - fetch by ID with cache check
- [ ] `getBatch()` - bulk fetch with cache
- [ ] `storeBatch()` - bulk store
- [ ] Scoring helpers (recency, emotion, access)
- [ ] ID generation (`mem_timestamp_random`)

---

### Day 4-5: Graph Link Preparation

**Create:** `src/memory/unified-store/graph/link-types.ts`

**Tasks:**
- [ ] Define `LinkType` enum (causal, temporal, emotional, person, topic, semantic, narrative, contrast)
- [ ] Define `MemoryLink` interface
- [ ] Define `MemoryLinkInput` interface
- [ ] Add link type metadata (bidirectional defaults, descriptions)

**Create:** `src/memory/unified-store/graph/firestore-links.ts`

**Tasks:**
- [ ] Implement `FirestoreMemoryLinkStore` class
- [ ] `addLink()` - create link with reverse if bidirectional
- [ ] `getLinksFrom()` - get outgoing links
- [ ] `getLinksTo()` - get incoming links
- [ ] `getAllLinks()` - get all links for memory
- [ ] `deleteLink()` - remove link and reverse
- [ ] `deleteLinksForMemory()` - cleanup on memory delete
- [ ] Index collections for efficient queries

---

## Week 2: Integration & Migration

### Day 6-7: Factory & Export

**Create:** `src/memory/unified-store/index.ts`

**Tasks:**
- [ ] Singleton factory function `getUnifiedStore()`
- [ ] Configuration loading from environment
- [ ] Graceful initialization (don't fail if services unavailable)
- [ ] Export all public types
- [ ] Export factory and interfaces

**Create:** `src/memory/index.ts` (public API)

**Tasks:**
- [ ] Re-export unified store factory
- [ ] Re-export key types
- [ ] Document usage in JSDoc

---

### Day 7-8: Testing

**Create:** `src/memory/unified-store/__tests__/`

**Tasks:**
- [ ] `facade.test.ts` - unit tests for facade
  - [ ] Test `store()` calls all adapters
  - [ ] Test `recall()` returns scored results
  - [ ] Test `update()` re-embeds on content change
  - [ ] Test `delete()` removes from all systems
  - [ ] Test scoring logic
  
- [ ] `firestore-adapter.test.ts` - unit tests for adapter
  - [ ] Mock Firestore client
  - [ ] Test CRUD operations
  - [ ] Test batch operations
  
- [ ] `cache-adapter.test.ts` - unit tests for cache
  - [ ] Test L1 caching
  - [ ] Test L2 fallback
  - [ ] Test TTL expiration
  - [ ] Test LRU eviction
  
- [ ] `integration.test.ts` - integration with emulator
  - [ ] Use `FIRESTORE_EMULATOR_HOST`
  - [ ] Full round-trip test
  - [ ] Test concurrent access

---

### Day 8-9: Migration Utilities

**Create:** `src/memory/unified-store/migration/shadow-writes.ts`

**Tasks:**
- [ ] Feature flag: `UNIFIED_STORE_SHADOW=true`
- [ ] Wrapper for existing stores that also writes to unified
- [ ] Non-blocking writes (catch errors, don't fail)
- [ ] Logging for monitoring

**Create:** `src/memory/unified-store/migration/comparison.ts`

**Tasks:**
- [ ] Compare old vs new recall results
- [ ] Log discrepancies
- [ ] Metrics for dashboard

**Create:** `scripts/migrate-to-unified-store.ts`

**Tasks:**
- [ ] Backfill script for existing memories
- [ ] Dry-run mode
- [ ] Progress reporting
- [ ] Resume capability

---

### Day 9-10: Integration Points

**Update:** `src/intelligence/context-builders/advanced-memory.ts`

**Tasks:**
- [ ] Add feature flag for unified store
- [ ] When enabled, use `getUnifiedStore().recall()` instead of direct access
- [ ] Log comparison between old and new results (shadow read)

**Update:** `src/tools/domains/memory/*.ts`

**Tasks:**
- [ ] Add feature flag for unified store
- [ ] When enabled, use unified store for all operations
- [ ] Maintain backward compatibility

---

## Files to Create

```
src/memory/
├── unified-store/
│   ├── types.ts                    # Day 1-2
│   ├── facade.ts                   # Day 3-4
│   ├── index.ts                    # Day 6
│   ├── adapters/
│   │   ├── types.ts                # Day 1-2
│   │   ├── firestore-adapter.ts    # Day 2-3
│   │   ├── vector-adapter.ts       # Day 2-3
│   │   └── cache-adapter.ts        # Day 2-3
│   ├── graph/
│   │   ├── link-types.ts           # Day 4-5
│   │   └── firestore-links.ts      # Day 4-5
│   ├── migration/
│   │   ├── shadow-writes.ts        # Day 8-9
│   │   └── comparison.ts           # Day 8-9
│   └── __tests__/
│       ├── facade.test.ts          # Day 7-8
│       ├── firestore-adapter.test.ts
│       ├── cache-adapter.test.ts
│       └── integration.test.ts
├── index.ts                        # Day 6
scripts/
└── migrate-to-unified-store.ts     # Day 8-9
```

---

## Files to Update

| File | Change |
|------|--------|
| `src/intelligence/context-builders/advanced-memory.ts` | Add unified store path |
| `src/tools/domains/memory/index.ts` | Add unified store path |
| `.env.example` | Add `UNIFIED_STORE_ENABLED` |
| `package.json` | Add migration script |

---

## Environment Variables

```bash
# Feature flags
UNIFIED_STORE_ENABLED=false    # Full cutover (Phase 1 end)
UNIFIED_STORE_SHADOW=true      # Shadow writes (Phase 1 week 1)

# Cache configuration
REDIS_URL=redis://localhost:6379  # Optional, L1 works without
CACHE_TTL_MS=300000               # 5 min default

# Debug
UNIFIED_STORE_DEBUG=true          # Verbose logging
```

---

## Testing Commands

```bash
# Run unit tests
pnpm vitest run src/memory/unified-store

# Run with emulator
FIRESTORE_EMULATOR_HOST=localhost:8080 pnpm vitest run src/memory/unified-store/__tests__/integration.test.ts

# Run migration dry-run
pnpm tsx scripts/migrate-to-unified-store.ts --dry-run --user-id=test-user

# Check test coverage
pnpm vitest run src/memory/unified-store --coverage
```

---

## Rollout Plan

### Week 1: Shadow Writes
```
Day 1-5: Build core components
Day 5:   Deploy with UNIFIED_STORE_SHADOW=true
         Old stores remain primary
         New store gets all writes (non-blocking)
```

### Week 2: Shadow Reads + Cutover
```
Day 6-7: Add shadow reads, compare results
Day 8:   Run backfill for existing data
Day 9:   Monitor comparison metrics
Day 10:  Set UNIFIED_STORE_ENABLED=true (cutover)
         Keep old stores available for rollback
```

---

## Success Criteria

| Criteria | Target | How to Measure |
|----------|--------|----------------|
| All tests pass | 100% | `pnpm vitest run` |
| Test coverage | >80% | `--coverage` flag |
| Store latency P50 | <100ms | Logging metrics |
| Recall latency P50 | <50ms | Logging metrics |
| Cache hit rate | >80% | Cache stats |
| Zero errors in shadow mode | 0 | Error logs |
| Comparison match rate | >95% | Comparison logs |

---

## Rollback Plan

If issues after cutover:

1. **Immediate:** Set `UNIFIED_STORE_ENABLED=false`
2. **Old stores still have data** (shadow writes went to both)
3. **Monitor:** Check error logs for specifics
4. **Fix:** Address issues, re-test
5. **Re-deploy:** Try cutover again

---

## Dependencies

### External
- `@google-cloud/firestore` (existing)
- `redis` (optional, for L2 cache)

### Internal
- `src/memory/firestore-vector-store/` (wrapped by adapter)
- `src/memory/embeddings.ts` (for generating embeddings)
- `src/utils/firestore-utils.ts` (for `cleanForFirestore`)

---

## Questions to Resolve

1. **Embedding model:** Use existing or upgrade? (Use existing for Phase 1)
2. **Redis availability:** Required or optional? (Optional, L1 cache works standalone)
3. **Backfill strategy:** All users or incremental? (Incremental by user activity)

---

## Next Phase Preview

After Phase 1 is complete:
- **Phase 2:** Memory Intelligence Layer
- Uses unified store for all operations
- Adds timing, selection, phrasing, learning

---

## Let's Start!

**First file to create:** `src/memory/unified-store/types.ts`

This establishes the interfaces that everything else implements.

---

*Ready to begin? Say "Let's build it" and I'll create the first file.*
