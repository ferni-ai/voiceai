# Spanner Graph Module

L3 Long-Term Memory storage using Google Cloud Spanner's native graph capabilities.

## Overview

This module provides the persistent graph database layer for Ferni's "Better Than Human" memory system. While Firestore handles L2 working memory (fast writes, recent data), Spanner Graph handles L3 long-term memory (relationship traversal, complex patterns).

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      L3: Spanner Graph                           │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────┐ │
│  │  Entities   │    │    Facts    │    │    Relationships    │ │
│  │   (Nodes)   │    │   (Nodes)   │    │       (Edges)       │ │
│  └──────┬──────┘    └──────┬──────┘    └──────────┬──────────┘ │
│         │                  │                      │             │
│         └───────────┬──────┴──────────────────────┘             │
│                     │                                           │
│         ┌───────────▼───────────┐                               │
│         │   FerniMemory Graph   │                               │
│         │      (ISO GQL)        │                               │
│         └───────────────────────┘                               │
└─────────────────────────────────────────────────────────────────┘
```

## Files

| File | Purpose |
|------|---------|
| `schema.ts` | DDL for tables and property graph, TypeScript types |
| `client.ts` | Spanner client with connection pooling, write operations |
| `queries.ts` | Pre-built GQL queries for common patterns |
| `graph-expansion.ts` | Multi-hop graph expansion for relationship traversal |
| `path-finder.ts` | Shortest path and weighted path finding between entities |
| `index.ts` | Public exports |

## Usage

### Initialization

```typescript
import { initializeSpanner, isSpannerReady } from './spanner-graph';

// At server startup
const ready = await initializeSpanner();
if (!ready) {
  console.log('Spanner not available, using Firestore fallback');
}
```

### Write Operations

```typescript
import { upsertEntity, insertFact, insertRelationship } from './spanner-graph';

// Add an entity
await upsertEntity({
  entityId: 'e-123',
  userId: 'user-456',
  name: 'Mike',
  entityType: 'person',
  attributes: { role: 'brother' },
  importance: 0.8,
  firstMentioned: new Date(),
  lastMentioned: new Date(),
  mentionCount: 5,
});

// Add a fact
await insertFact({
  factId: 'f-789',
  userId: 'user-456',
  factType: 'attribute',
  key: 'job',
  value: 'software engineer',
  confidence: 0.9,
  extractedAt: new Date(),
});

// Add a relationship
await insertRelationship({
  relationshipId: 'r-abc',
  userId: 'user-456',
  sourceEntityId: 'e-123', // Mike
  targetEntityId: 'e-user', // User
  relationshipType: 'brother_of',
  strength: 0.95,
  bidirectional: true,
});
```

### Graph Queries

```typescript
import { getImportantPeople, findEntitiesWithFactPattern } from './spanner-graph';

// The people who matter most to the caller
const people = await getImportantPeople(userId);

// People with a matching fact, e.g. everyone the caller is worried about
const worried = await findEntitiesWithFactPattern(userId, 'feeling', 'worried');
```

## GQL Query Examples

### Entity with Facts
```sql
GRAPH FerniMemory
MATCH (e:Entity WHERE e.name = 'Mike')-[:EntityFact]->(f:Fact)
RETURN e.name, f.key, f.value
```

### Relationship Traversal
```sql
GRAPH FerniMemory
MATCH (source:Entity WHERE source.name = 'Mom')-[rel:Relationship]-(target:Entity)
RETURN source.name, rel.relationship_type, target.name
```

### Multi-hop Pattern
```sql
GRAPH FerniMemory
MATCH path = (start:Entity)-[:Relationship*1..2]-(connected:Entity)
WHERE start.name = 'User'
RETURN connected.name, LENGTH(path) as depth
```

## Spanner Configuration

| Setting | Value |
|---------|-------|
| Project | `johnb-2025` |
| Instance | `ferni-memory` |
| Database | `knowledge_graph` |
| Region | `us-central1` |
| Processing Units | 100 (minimal) |
| Cost | ~$65/month |

## Data Flow

```
Deep Extraction Worker → Firestore (immediate)
                              ↓
                    Background Sync (every 5 min)
                              ↓
                      Spanner Graph (L3)
```

Firestore is the write path for low latency. Spanner is synced in background for complex queries.

## Graceful Degradation

If Spanner is unavailable:
1. `isSpannerReady()` returns `false`
2. Write operations silently return
3. Query operations return empty arrays
4. Firestore continues to work normally

This ensures the system never fails due to Spanner issues.

## Performance

| Operation | Latency |
|-----------|---------|
| Simple query | 50-100ms |
| Graph traversal (1-hop) | 100-150ms |
| Graph traversal (2-hop) | 150-200ms |
| Write (transaction) | 20-50ms |

## Cost Optimization

- Use relational queries for simple lookups (faster, cheaper)
- Use graph queries only for traversal patterns
- Batch writes in transactions
- Keep `maxHops` <= 3 for traversals
