# Unified Entity Store

> **"What do we know about Mike?"** - A question that was impossible to answer before this module.

This module provides a **unified knowledge graph** for all entities (people, places, events, concepts) in a user's life. It replaces the fragmented storage that existed across 7+ separate Firestore collections.

---

## The Problem We Solved

Before this module, when a user said "my brother's phone is 555-1234", the data went to `user_contacts`. But when they said "call my brother", the telephony tool searched `contact_relationships`. These collections didn't talk to each other.

**Fragmented collections we're replacing:**

| Collection | Used By | What It Stored |
|------------|---------|----------------|
| `user_contacts` | `contacts.ts` | Basic contact info |
| `contact_relationships` | `contact-relationship-service.ts` | Telephony contacts |
| `relationship_network` | `superhuman/relationship-network.ts` | Social graph |
| `relationship_nodes` | `semantic-intelligence/relationship-graph.ts` | Graph nodes |
| `guest_profiles` | `jordan-planning-services.ts` | Event guests |
| `network/relationships` | Research tools | Another contact store |

---

## Architecture

```
entity_store/{userId}/
├── entities/           # All entities (people, places, events, concepts)
├── mentions/           # Every time an entity is mentioned
└── relationships/      # Edges connecting entities
```

### Core Components

```
entity-store/
├── __tests__/              # Unit tests (entity-resolver, entity-store)
├── types.ts                # Type definitions (Entity, Mention, Relationship)
├── store.ts                # Core entity store implementation (34KB) — main CRUD + query engine
├── storage.ts              # Firestore persistence operations
├── entity-resolver.ts      # Resolves mentions to canonical entities
├── entity-cache.ts         # In-memory entity cache for fast lookups
├── integration.ts          # Hooks for data capture, telephony, etc.
├── migration.ts            # Migrates legacy collections to unified store
├── dual-write.ts           # Write to both entity store and legacy collections during migration
├── legacy-adapter.ts       # Adapter for legacy collection reads during transition
├── consolidation.ts        # Merge duplicate entities, consolidate mentions
├── correlation-engine.ts   # Cross-entity correlation and relationship inference
├── graph-rag.ts            # Graph-based RAG retrieval over entity relationships
├── proactive-surfacing.ts  # Proactively surface entity context at the right moment
└── index.ts                # Main exports
```

---

## Usage

### Capturing a Person from Conversation

```typescript
import { capturePersonEntity, isEntityStoreReady } from '../memory/entity-store/index.js';

// In data capture or turn processor:
if (isEntityStoreReady()) {
  const result = await capturePersonEntity(userId, {
    name: 'Mike',
    relationship: 'brother',
    phone: '555-1234',
  }, {
    conversationId: sessionId,
    sessionId: sessionId,
    personaId: 'ferni',
    transcript: 'My brother Mike's phone is 555-1234',
  });
  
  // result.entity - The canonical entity
  // result.isNew - true if newly created
  // result.merged - true if merged with existing
  // result.confidence - 0-1 confidence score
}
```

### Finding a Contact for Telephony

```typescript
import { findContactForTelephony } from '../memory/entity-store/index.js';

// Replaces fragmented lookups in call-on-behalf.ts
const contact = await findContactForTelephony(userId, 'my brother');
// Returns: { name: 'Mike', phone: '555-1234', relationship: 'brother' }
```

### Querying Everything About Someone

```typescript
import { whatDoWeKnowAbout } from '../memory/entity-store/index.js';

const info = await whatDoWeKnowAbout(userId, 'Mike');
// Returns:
// {
//   entity: Entity,              // The person
//   mentions: Mention[],         // Every time they were mentioned
//   facts: ExtractedFact[],      // All facts we know
//   relationships: EntityRelationship[], // Connections to other entities
//   relatedEntities: Entity[]    // Related people/things
// }
```

---

## Entity Resolution

The **entity resolver** is the brain of this module. When someone mentions "my brother" or "Mike" or "bro", it figures out which entity they're referring to.

**Resolution strategy (in order):**
1. **Exact name match** - "Mike" → find entity with canonicalName="Mike"
2. **Relationship match** - "my brother" → find entity with specificRelation="brother"
3. **Alias match** - "bro" → find entity where aliases includes "bro"
4. **Phone match** - Same phone number → same person
5. **Create new** - No match found → create new entity

### Handling Ambiguity

If user has two brothers, and says "my brother":
- If one was mentioned recently, prefer that one
- If both have names, ask for clarification
- If only one has a phone number and they said "call my brother", prefer the one with phone

---

## Migration

To migrate a user's legacy data:

```typescript
import { migrateUser } from '../memory/entity-store/migration.js';

const result = await migrateUser(userId, { dryRun: true }); // Preview first
console.log(result);
// {
//   entitiesCreated: 15,
//   entitiesMerged: 8,         // Duplicates found and merged
//   legacyCollections: {
//     userContacts: 10,
//     relationshipNetwork: 12,
//     contactRelationships: 5,
//     ...
//   }
// }

// Actually run it
await migrateUser(userId, { dryRun: false });
```

To migrate all users (run as batch job):

```typescript
import { migrateAllUsers } from '../memory/entity-store/migration.js';

await migrateAllUsers({ dryRun: false, limit: 100 });
```

---

## Rules

### Do
- Always use `capturePersonEntity()` for new person mentions
- Use `findContactForTelephony()` instead of legacy contact lookups
- Run migration before deprecating legacy collections
- Store legacy IDs for backwards compatibility during transition

### Don't
- Don't write directly to legacy collections (they're read-only now)
- Don't skip the entity resolver (it handles deduplication)
- Don't delete legacy collections until migration is verified
- Don't import from higher architecture levels

---

## Integration Points

### Data Capture (`src/intelligence/data-capture/index.ts`)

Already integrated! When contacts are captured from conversation, they go to both:
1. Entity store (primary) ✅
2. Legacy collections (backwards compatibility)

### Telephony Tools (`src/tools/domains/telephony/`)

Update to use entity store:

```typescript
// OLD (fragmented):
const contact = await searchContacts(userId, query); // Only searches contact_relationships

// NEW (unified):
const contact = await findContactForTelephony(userId, query); // Searches entity_store
```

### Context Builders

The entity store enables new context builders:

```typescript
// "What do we know about people mentioned in this turn?"
const mentionedPeople = await extractMentions(transcript);
for (const mention of mentionedPeople) {
  const info = await whatDoWeKnowAbout(userId, mention);
  // Inject into LLM context
}
```

---

## Firestore Schema

### Entity Document

```typescript
entity_store/{userId}/entities/{entityId}
{
  id: string,
  userId: string,
  type: 'person' | 'place' | 'event' | 'concept' | ...,
  canonicalName: string,      // "Mike"
  aliases: string[],          // ["michael", "brother", "bro"]
  relationship: string,       // "family"
  specificRelation: string,   // "brother"
  contact: {
    phone?: string,
    email?: string,
    address?: string,
  },
  salience: number,           // 0-1, how important
  emotionalWeight: number,    // 0-1, emotional significance
  mentionCount: number,
  firstMentionedAt: Timestamp,
  lastMentionedAt: Timestamp,
  legacyIds: {                // For migration
    userContactId?: string,
    relationshipNetworkId?: string,
    ...
  }
}
```

### Mention Document

```typescript
entity_store/{userId}/mentions/{mentionId}
{
  id: string,
  entityId: string,
  transcript: string,
  sessionId: string,
  personaId: string,
  timestamp: Timestamp,
  mentionType: 'reference' | 'story' | 'emotion' | 'fact' | ...,
  sentiment: number,          // -1 to 1
  emotionalIntensity: number, // 0-1
  topics: string[],
  facts: ExtractedFact[],
}
```

---

## Testing

```bash
# Run entity store tests
pnpm vitest run src/memory/entity-store/

# Test migration (dry run)
pnpm tsx scripts/migrate-entity-store.ts --dry-run --user=<userId>
```

---

*Last updated: January 2026*
