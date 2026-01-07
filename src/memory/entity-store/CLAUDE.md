# Entity Store - Superhuman Memory Foundation

> **"Store once, link everywhere."**

The entity store is the unified foundation for Ferni's "Better Than Human" memory.
It eliminates the fragmentation across 50+ Firestore collections by providing a
single, entity-centric data model with semantic search and graph relationships.

---

## Quick Start

```typescript
import {
  getEntityStore,
  initializeEntityStore,
  graphRAGRetrieve,
  getProactiveSurfacingEngine,
} from '../memory/entity-store/index.js';

// Initialize (do once at startup)
await initializeEntityStore();

// Create an entity
const store = getEntityStore();
const mike = await store.createEntity(
  userId,
  'person',
  'Mike',
  {
    _type: 'person',
    relationship: 'brother',
    relationshipCategory: 'family',
    phone: '555-1234',
    sentiment: 0.8,
  },
  { aliases: ['my brother', 'bro'] }
);

// Search with Graph-RAG
const results = await graphRAGRetrieve(
  userId,
  'call my brother',
  { personaId: 'ferni' },
  { topK: 5, expandGraph: true }
);

// Proactive surfacing
const engine = getProactiveSurfacingEngine();
const opportunities = await engine.analyze({
  userId,
  currentTurn: "I'm thinking about family...",
  sessionId: 'abc123',
  personaId: 'ferni',
  turnNumber: 3,
  surfacingCountThisSession: 0,
  sessionTopics: ['family'],
});
```

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         Entity Store                                      │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────┐     ┌──────────────────┐     ┌────────────────────┐   │
│  │   types.ts  │     │    store.ts      │     │   graph-rag.ts     │   │
│  │             │     │                  │     │                    │   │
│  │  Entity     │────▶│  EntityStore     │────▶│  GraphRAGRetriever │   │
│  │  Relations  │     │  - CRUD          │     │  - Hybrid search   │   │
│  │  Attributes │     │  - Search        │     │  - Graph expansion │   │
│  │             │     │  - Graph ops     │     │  - Reranking       │   │
│  └─────────────┘     └──────────────────┘     └────────────────────┘   │
│                                                                          │
│  ┌────────────────────────┐     ┌────────────────────────────────────┐  │
│  │  proactive-surfacing.ts│     │         migration.ts               │  │
│  │                        │     │                                    │  │
│  │  - Temporal triggers   │     │  - Legacy collection migration     │  │
│  │  - Pattern insights    │     │  - Deduplication                   │  │
│  │  - Commitment checkins │     │  - Relationship creation           │  │
│  │  - Receptivity scoring │     │                                    │  │
│  └────────────────────────┘     └────────────────────────────────────┘  │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Key Concepts

### 1. Entities

Everything is an entity with a unified schema:

| Type | Description | Key Attributes |
|------|-------------|----------------|
| `person` | People in user's life | relationship, phone, sentiment |
| `commitment` | Promises, intentions | status, targetDate, originalStatement |
| `event` | Past/future events | date, eventType, relatedPeople |
| `dream` | Long-term aspirations | status, obstacles |
| `value` | Core values | strength, demonstrations |
| `pattern` | Behavioral patterns | confidence, shouldSurface |
| `goal` | Active goals | progress, milestones |
| `memory` | Specific moments | content, emotionalIntensity |

### 2. Entity Resolution

The key to solving fragmentation - "my brother" always resolves to the same entity:

```typescript
const { entity, isNew } = await store.resolveEntity(
  userId,
  'my brother',
  'person',
  { relationship: 'brother' }
);

// If "Mike" (the brother) already exists, returns that entity
// Otherwise creates new entity with "my brother" as an alias
```

### 3. Graph Relationships

Entities connect via typed relationships:

```typescript
await store.createRelationship(
  mikeEntityId,
  surgeryEventId,
  'involves',           // RelationshipType
  {
    strength: 0.9,      // How strong the connection
    context: 'Mike is having surgery',
    bidirectional: false,
  }
);
```

**Relationship Types:**
- `involves` - Event involves Person
- `about` - Commitment is about Topic
- `causes` - X causes Y
- `mentions` - Memory mentions Person
- `triggers` - Emotion triggered by Event

### 4. Graph-RAG Retrieval

State-of-the-art hybrid search:

```typescript
const results = await graphRAGRetrieve(userId, 'call my brother', context, {
  topK: 10,
  expandGraph: true,    // Follow relationships
  maxGraphHops: 2,      // 2 levels of connections
  hybrid: true,         // BM25 + Vector fusion
  rerank: false,        // Cross-encoder (expensive)
});
```

**Pipeline:**
1. **BM25 Search** - Keyword matching for exact names
2. **Vector Search** - Semantic similarity
3. **Reciprocal Rank Fusion** - Combine results
4. **Graph Expansion** - Follow relationships 1-2 hops
5. **Temporal/Emotional Weighting** - Boost recent + significant
6. **Cross-Encoder Rerank** (optional) - More accurate scoring

### 5. Proactive Surfacing

Know WHEN to surface, not just WHAT:

```typescript
const opportunities = await engine.analyze(context);

// Returns opportunities like:
// {
//   type: 'temporal',
//   entity: mikeBirthdayEvent,
//   timing: 'soon',
//   naturalPhrasing: "Mike's birthday is tomorrow!",
//   receptivityScore: 0.85,
// }
```

---

## Firestore Collections

| Collection | Purpose |
|------------|---------|
| `entities` | All unified entities |
| `entity_relationships` | Graph edges |
| `entity_mentions` | Track every mention |

**Schema:**
```
entities/{entityId}
├── userId: string
├── type: EntityType
├── canonicalName: string
├── aliases: string[]
├── embedding: vector(1536)
├── salienceScore: number
├── emotionalWeight: number
├── temporalContext: { peakMoments, lastEmotionalPeak, ... }
├── attributes: { _type: 'person', relationship, phone, ... }
└── searchTokens: string[]
```

---

## Migration

Migrate from legacy fragmented collections:

```typescript
// Single user
const result = await migrateUserToEntities(userId);
console.log(`Created ${result.entitiesCreated}, merged ${result.entitiesMerged}`);

// All users (batch)
const { totalUsers, successful, failed } = await runFullMigration({
  batchSize: 10,
  dryRun: false,
});
```

**Collections Migrated:**
- `user_contacts`
- `contact_relationships`
- `relationship_network`
- `commitments`
- `dreams`
- `values`
- `patterns`
- And 40+ more...

---

## Integration Points

### Data Capture

When user mentions someone/something, use entity resolution:

```typescript
// In data capture pipeline
const { entity, isNew } = await store.resolveEntity(
  userId,
  extractedName,
  'person',
  { relationship: extractedRelationship }
);

// Record the mention
await store.recordMention(entity.id, {
  userId,
  conversationId,
  sessionId,
  personaId,
  snippet: userText,
  emotionalWeight: detectedEmotion.intensity,
});
```

### Context Builders

Use Graph-RAG for memory retrieval:

```typescript
// In unified-memory-orchestrator or similar
const memories = await graphRAGRetrieve(userId, userTurn, {
  currentTopic,
  personaId,
  recentEntityMentions: recentlyMentioned,
});

// Convert to context injection
return memories.entities.map(r => ({
  content: formatEntityForContext(r.entity),
  reason: r.reason,
  priority: r.score * 100,
}));
```

### Proactive Surfacing

Wire into turn processor:

```typescript
// After analyzing user turn
const surfacingOpportunities = await surfacingEngine.analyze({
  userId,
  currentTurn: userText,
  sessionId,
  personaId,
  turnNumber,
  surfacingCountThisSession,
  sessionTopics,
  conversationMood: detectedMood,
});

// Inject top opportunity into response guidance
if (surfacingOpportunities.length > 0 && surfacingOpportunities[0].timing === 'immediate') {
  responseGuidance.proactiveSurfacing = surfacingOpportunities[0].naturalPhrasing;
}
```

---

## Best Practices

### 1. Always Use Entity Resolution

```typescript
// ❌ Bad - creates duplicates
await store.createEntity(userId, 'person', 'my mom', attrs);

// ✅ Good - finds existing or creates
const { entity } = await store.resolveEntity(userId, 'my mom', 'person');
```

### 2. Record All Mentions

```typescript
// Every time an entity is referenced in conversation
await store.recordMention(entityId, context);
```

### 3. Create Relationships When Linking

```typescript
// When a commitment involves a person
await store.createRelationship(commitmentId, personId, 'involves');
```

### 4. Use Graph-RAG for Retrieval

```typescript
// ❌ Bad - misses relationships
const results = await store.searchEntities(query, { userId });

// ✅ Good - expands via graph
const results = await graphRAGRetrieve(userId, query, ctx, { expandGraph: true });
```

---

## Debugging

### Check Entity Resolution

```typescript
const store = getEntityStore();
const entities = await store.getUserEntities(userId, { types: ['person'] });
console.log('People:', entities.map(e => ({
  name: e.canonicalName,
  aliases: e.aliases,
  salience: e.salienceScore,
})));
```

### Inspect Relationships

```typescript
const relationships = await store.getEntityRelationships(entityId);
console.log('Relationships:', relationships.map(r => ({
  type: r.type,
  to: r.toEntity,
  strength: r.strength,
})));
```

### Search Quality

```typescript
const results = await graphRAGRetrieve(userId, query, context, options);
console.log('Results:', results.entities.map(r => ({
  name: r.entity.canonicalName,
  score: r.score,
  breakdown: r.scoreBreakdown,
  reason: r.reason,
})));
```

---

## Files

| File | Description |
|------|-------------|
| `types.ts` | All TypeScript types and interfaces |
| `store.ts` | EntityStore class - CRUD, search, relationships |
| `graph-rag.ts` | Graph-RAG retrieval pipeline |
| `proactive-surfacing.ts` | When to surface memories |
| `migration.ts` | Legacy collection migration |
| `index.ts` | Public exports |
