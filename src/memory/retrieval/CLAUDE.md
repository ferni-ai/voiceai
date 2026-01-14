# Retrieval Module

Unified entry point for all memory retrieval operations.

## Quick Start

```typescript
import { 
  retrieveContext, 
  semanticSearch, 
  findEntity,
  getRecentContext 
} from './memory/retrieval/index.js';

// Full context retrieval
const result = await retrieveContext(userId, 'What do we know about Mike?', {
  currentTopic: 'family',
}, {
  includeAssociative: true,
  includeRelationships: true,
});

// Quick semantic search
const memories = await semanticSearch(userId, 'career goals', 5);

// Find an entity
const entity = await findEntity(userId, 'Mike');

// Get recent conversation context
const context = await getRecentContext(sessionId, userId);
```

## Architecture

```
Query
  │
  ▼
retrieveContext() ─────────────────┐
  │                                │
  ├─→ Semantic Search (vectors)    │
  ├─→ Entity Store (graph)         │
  ├─→ STM Buffer (recent)          │
  └─→ Memory Graph (associations)  │
        │                          │
        ▼                          │
  Ranked & Merged Results          │
```

## Key Functions

| Function | Purpose | Sources |
|----------|---------|---------|
| `retrieveContext()` | Full multi-source retrieval | All |
| `semanticSearch()` | Quick vector similarity | Vectors only |
| `findEntity()` | Entity lookup | Entity store |
| `getRecentContext()` | Current session context | STM buffer |
| `getProactiveSuggestions()` | Proactive memory surfacing | Entity store |

## Retrieval Options

```typescript
interface RetrievalOptions {
  topK?: number;           // Max results (default: 10)
  minScore?: number;       // Min relevance 0-1 (default: 0.3)
  includeAssociative?: boolean;  // Spreading activation
  includeSTM?: boolean;    // Short-term memory
  includeRelationships?: boolean; // Knowledge graph
  personaId?: string;      // Filter by persona
}
```

## Return Types

```typescript
interface RetrievalResult {
  memories: RetrievedMemory[];  // Ranked memories
  entities: EntityMatch[];       // Matched entities
  stmContext?: string;          // Recent context
  metadata: {
    query: string;
    totalResults: number;
    sources: string[];          // Which sources returned data
    retrievalTimeMs: number;
  };
}
```

## Re-exports

This module re-exports from:
- `advanced-retrieval.ts` - Memory retrieval algorithms
- `semantic-rag.ts` - Semantic search
- `retrieval-explanations.ts` - Natural language explanations
- `natural-reference-generator.ts` - Reference generation

## Usage Notes

- Use `retrieveContext()` for comprehensive retrieval
- Use `semanticSearch()` for quick lookups
- Results are ranked by relevance score
- Multiple sources are merged and deduplicated
