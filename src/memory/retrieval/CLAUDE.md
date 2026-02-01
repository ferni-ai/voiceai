# Memory Retrieval Module

> Multi-strategy memory retrieval: hybrid search (BM25 + vector), neural reranking, confidence scoring, and per-turn orchestration.

---

## Architecture

```
User Turn
    │
    ▼
retrieveForTurn()                    ← Per-turn orchestrator
    │
    ├─→ Hybrid Search ──┐
    │   ├─ BM25 Search   │           ← Keyword matching ("Mike", "my brother")
    │   ├─ Vector Search  │           ← Semantic similarity ("relationship problems")
    │   └─ Entity Store   │           ← Graph lookups
    │                     │
    │   Reciprocal Rank Fusion        ← Combine without score normalization
    │                     │
    ├─→ Cross-Encoder Reranker        ← Neural reranking (Gemini/local/heuristic)
    │
    ├─→ Confidence Scoring            ← Multi-factor confidence assessment
    │
    ├─→ Attribution Builder           ← Human-readable memory references
    │
    └─→ MemoryContext                 ← Formatted for LLM injection
```

### Multi-Source Retrieval (index.ts)

The unified `retrieveContext()` function queries 5 sources in parallel:

1. **Recent Writes Cache** — Write-through cache (30s TTL) fixes race condition where retrieval happens before async indexing completes
2. **Semantic Search** — Vector similarity via `advanced-retrieval.ts`
3. **Entity Store** — Knowledge graph lookups
4. **STM Buffer** — Current session short-term memory
5. **Associative Memory** — Spreading activation from seed memories
6. **Knowledge Graph** — Natural language graph queries

---

## Files

| File | Purpose |
|------|---------|
| `index.ts` | Unified retrieval entry point, write-through cache, LRU result cache |
| `turn-memory-retrieval.ts` | Per-turn retrieval orchestrator (< 100ms budget) |
| `hybrid-search.ts` | BM25 + vector + entity store with RRF fusion |
| `bm25-search.ts` | BM25 keyword search index (exact name/keyword matching) |
| `semantic-memory-search.ts` | Vector search for memories, anchors, session summaries, facts |
| `hybrid-continuity-retrieval.ts` | Firestore + Spanner + Vector retrieval for conversation continuity |
| `cross-encoder.ts` | Neural reranking (Gemini, local, heuristic providers) |
| `rank-fusion.ts` | Reciprocal Rank Fusion, weighted score fusion, team draft interleave |
| `tokenizer.ts` | Tokenization, stemming, stop words for BM25 |
| `confidence-scoring.ts` | Multi-factor memory confidence assessment |
| `attribution-builder.ts` | Build human-readable memory attributions and corrections |
| `recall-attribution.ts` | Parse and track memory usage in agent responses |
| `memory-feedback.ts` | Feedback loop: boost/decay memory scores based on usage |
| `injected-memory-store.ts` | Track injected memories across turns for attribution |

---

## Usage

### Unified Retrieval (Recommended)

```typescript
import { retrieveContext, semanticSearch, findEntity } from './memory/retrieval/index.js';

// Full multi-source retrieval
const result = await retrieveContext(userId, 'What do we know about Mike?', {
  currentTopic: 'family',
}, {
  includeAssociative: true,
  includeRelationships: true,
});

// Quick semantic search
const memories = await semanticSearch(userId, 'career goals', 5);

// Entity lookup
const entity = await findEntity(userId, 'Mike');
```

### Per-Turn Retrieval

```typescript
import { retrieveForTurn, formatMemoryContextForPrompt } from './memory/retrieval/index.js';

// Orchestrates hybrid search → reranking → dedup → formatting
const turnMemories = await retrieveForTurn({
  userId,
  sessionId,
  transcript: userMessage,
  turnNumber: 5,
  personaId: 'ferni',
});

const promptContext = formatMemoryContextForPrompt(turnMemories);
```

### Hybrid Search (BM25 + Vector)

```typescript
import { hybridSearch, findEntityHybrid } from './memory/retrieval/index.js';

// BM25 keyword + vector semantic + RRF fusion
const results = await hybridSearch(userId, 'my brother Mike', {
  topK: 10,
  bm25Weight: 0.4,
  vectorWeight: 0.6,
});

// Entity-focused hybrid search
const entity = await findEntityHybrid(userId, 'Mike');
```

### Cross-Encoder Reranking

```typescript
import { rerankHybridResults, getReranker } from './memory/retrieval/index.js';

// Rerank hybrid search results with neural cross-encoder
const reranked = await rerankHybridResults(query, hybridResults, {
  provider: 'gemini', // or 'local', 'heuristic'
  topK: 5,
});
```

---

## Key Concepts

### Write-Through Cache

Solves the race condition where `fastCapture()` writes a memory but `retrieveContext()` runs before async indexing completes:

- 30-second TTL
- Simple substring matching
- Automatically included in retrieval results with high score (0.95)

### Reciprocal Rank Fusion (RRF)

Combines BM25 and vector results without score normalization:
- BM25 excels at exact keyword matches ("Mike", "555-1234")
- Vector search excels at semantic similarity ("relationship problems")
- RRF combines ranked lists using `1 / (k + rank)` formula

### Confidence Scoring

Multi-factor confidence assessment for memory quality:
- Source reliability
- Temporal recency
- Extraction method confidence
- Corroboration from multiple sources

### Attribution

Track which memories were used in agent responses:
- `recall-attribution.ts` — Parse agent output for memory references
- `attribution-builder.ts` — Generate human-readable attributions
- `memory-feedback.ts` — Boost frequently-used memories, decay ignored ones
- `injected-memory-store.ts` — Store injected memories per session for tracking

---

## Re-exports

The module re-exports from parent-level memory files for convenience:

| Parent File | What It Provides |
|-------------|-----------------|
| `../advanced-retrieval.ts` | `retrieveMemories`, `buildMemoryIndex`, topic/person search |
| `../semantic-rag.ts` | `semanticRagSearch` |
| `../retrieval-explanations.ts` | `getRetrievalExplainer` |
| `../natural-reference-generator.ts` | `getNaturalReferenceGenerator` |

---

## Performance

| Operation | Budget | Notes |
|-----------|--------|-------|
| Per-turn retrieval | < 100ms | Hybrid search + reranking + formatting |
| BM25 search | < 5ms | In-memory index |
| Vector search | 50-150ms | Firestore `findNearest()` |
| Cross-encoder rerank | 20-50ms | Gemini provider |
| RRF fusion | < 1ms | Pure computation |
| LRU cache hit | < 1ms | 100 entries, 30s TTL |

---

## Testing

```bash
# Run all retrieval tests
pnpm vitest run src/memory/retrieval/

# Run parent-level retrieval tests
pnpm vitest run src/memory/__tests__/
```

---

## Related Modules

- `../advanced-retrieval.ts` — RAG-style semantic search
- `../semantic-rag.ts` — Semantic RAG retrieval
- `../firestore-vector-store/` — Vector embeddings storage
- `../entity-store/` — Entity graph queries
- `../dynamic/stm-buffer.ts` — Short-term memory buffer
- `../spreading-activation.ts` — Associative memory activation

---

*Last updated: January 2026*
