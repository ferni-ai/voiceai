# Superhuman Memory Architecture

> **"Better than human means better than human memory."**
>
> Your best friend forgets details. Your therapist doesn't have 24/7 recall.
> We remember everything that matters, connect dots no human could track,
> and surface memories at exactly the right moment.

---

## The Problem with Current Architecture

### Data Fragmentation

We have **50+ Firestore subcollections** that don't talk to each other:

```
bogle_users/{userId}/
├── user_contacts           # Contacts service
├── contact_relationships   # Contact relationship service  
├── relationship_network    # Relationship network service
├── relationship_nodes      # Relationship graph service
├── relationship_connections # Relationship graph edges
├── commitments            # Commitment keeper
├── patterns               # Predictive coaching
├── habit_dna              # Maya's habit service
├── dreams                 # Dream keeper
├── values                 # Values alignment
├── ... 40+ more collections
```

**The Problem:** When user says "my brother Mike", we might find:
- ✅ Mike in `user_contacts`
- ❌ Miss Mike in `relationship_network` 
- ❌ Miss Mike's commitment in `commitments`
- ❌ Miss Mike's birthday in `important_dates`

### Missing Capabilities

1. **No Entity Linking** - "brother" in contacts ≠ "brother" in commitments
2. **No Graph Traversal** - Can't ask "everything related to Mike"
3. **No Hybrid Search** - Vector-only, missing keyword matches
4. **No Cross-Domain Correlation** - Can't see patterns across domains
5. **No Memory Consolidation** - Memories accumulate forever
6. **No Proactive Intelligence** - Only retrieves when asked

---

## The Solution: Entity-Centric Graph-RAG

### Core Principle

**Store once, link everywhere.**

Every piece of user data becomes:
1. An **Entity** (person, place, event, commitment, etc.)
2. With **Embeddings** for semantic search
3. Connected via **Relationships** in a graph
4. Enriched with **Temporal Context** (when, emotional weight)

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         USER INPUT (Voice/Text)                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    ENTITY EXTRACTION & LINKING                              │
│  • Extract entities (people, places, events, commitments)                   │
│  • Link to existing entities or create new ones                             │
│  • Update entity embeddings and graph connections                           │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
                    ▼               ▼               ▼
┌─────────────────────┐  ┌──────────────────┐  ┌─────────────────────────────┐
│   ENTITY STORE      │  │  GRAPH LAYER     │  │    VECTOR INDEX            │
│   (Unified)         │  │  (Relationships) │  │    (Embeddings)            │
│                     │  │                  │  │                            │
│  entities/{id}      │  │  • Person→Event  │  │  • Entity embeddings       │
│  • type             │  │  • Event→Person  │  │  • Multi-vector per entity │
│  • canonical_name   │  │  • Commitment→   │  │  • Contextual embeddings   │
│  • aliases          │  │      Person      │  │                            │
│  • attributes       │  │  • Temporal links│  │                            │
│  • first_seen       │  │                  │  │                            │
│  • last_seen        │  │                  │  │                            │
│  • salience_score   │  │                  │  │                            │
└─────────────────────┘  └──────────────────┘  └─────────────────────────────┘
                    │               │               │
                    └───────────────┼───────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         GRAPH-RAG RETRIEVAL                                 │
│  1. Hybrid Search: BM25 + Vector similarity fusion                         │
│  2. Graph Expansion: Follow relationships 1-2 hops                         │
│  3. Cross-Encoder Rerank: Score top-K with fine-tuned model               │
│  4. Temporal Weighting: Recent + emotionally significant = higher          │
│  5. Context Assembly: Build coherent narrative from retrieved entities     │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PROACTIVE SURFACING ENGINE                          │
│  • Timing Intelligence: When is the right moment?                          │
│  • Receptivity Scoring: Is user in the right state?                        │
│  • Relevance Triggers: What in this turn connects to stored memory?        │
│  • Causal Awareness: What might this lead to?                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Data Model

### Unified Entity Schema

```typescript
/**
 * Unified entity - the atomic unit of memory
 */
interface Entity {
  // Identity
  id: string;                    // UUID
  userId: string;                // Owner
  type: EntityType;              // person | place | event | commitment | value | dream | pattern | ...
  
  // Names and aliases
  canonicalName: string;         // Primary display name
  aliases: string[];             // Other names/references ("mom", "mother", "my mom", "Sarah")
  
  // Semantic search
  embedding: number[];           // Primary embedding (1536 dims)
  contextualEmbeddings: {        // Context-aware embeddings
    asSubject: number[];         // "Mike went to..." 
    asObject: number[];          // "...called Mike"
    inEmotion: number[];         // "worried about Mike"
  };
  
  // Temporal
  firstSeen: Timestamp;          // When first mentioned
  lastSeen: Timestamp;           // Most recent mention
  mentionCount: number;          // How often mentioned
  temporalContext: {
    peakMoments: Timestamp[];    // Emotionally significant mentions
    lastEmotionalPeak: Timestamp;
    emotionalDecayRate: number;  // How fast salience decays
  };
  
  // Salience
  salienceScore: number;         // 0-1, how important overall
  emotionalWeight: number;       // 0-1, emotional significance
  recencyBoost: number;          // Computed from lastSeen
  
  // Type-specific attributes (polymorphic)
  attributes: EntityAttributes;  // Type-dependent fields
  
  // Provenance
  sourceConversations: string[]; // Which conversations mentioned this
  sourcePersonas: string[];      // Which personas learned this
  confidence: number;            // How confident in this entity
}

/**
 * Entity types and their specific attributes
 */
type EntityType = 
  | 'person'       // People in user's life
  | 'place'        // Locations that matter
  | 'event'        // Past or future events
  | 'commitment'   // Promises, intentions, decisions
  | 'value'        // Core values
  | 'dream'        // Long-term aspirations
  | 'pattern'      // Behavioral patterns
  | 'preference'   // Likes, dislikes, preferences
  | 'memory'       // Specific remembered moments
  | 'topic'        // Recurring conversation topics
  | 'emotion'      // Emotional states/patterns
  | 'goal';        // Active goals

/**
 * Type-specific attributes
 */
type EntityAttributes = 
  | PersonAttributes
  | EventAttributes
  | CommitmentAttributes
  | ValueAttributes
  | DreamAttributes
  | PatternAttributes
  | PreferenceAttributes
  | MemoryAttributes;

interface PersonAttributes {
  relationship: string;          // "brother", "boss", "friend"
  relationshipCategory: 'family' | 'friend' | 'colleague' | 'acquaintance' | 'professional';
  phone?: string;
  email?: string;
  birthday?: DateOnly;
  comfortPatterns?: string[];    // What comforts them
  stressTriggers?: string[];     // What stresses them
  recentContext?: string[];      // Recent things mentioned about them
  sentiment: number;             // -1 to 1, user's feelings toward them
}

interface EventAttributes {
  eventType: 'birthday' | 'anniversary' | 'appointment' | 'milestone' | 'loss' | 'celebration';
  date?: Timestamp;
  isRecurring: boolean;
  recurringPattern?: string;     // "yearly", "monthly"
  relatedPeople: string[];       // Entity IDs of related people
  emotionalSignificance: 'routine' | 'meaningful' | 'major' | 'life_changing';
}

interface CommitmentAttributes {
  commitmentType: 'promise' | 'intention' | 'decision' | 'goal';
  status: 'active' | 'completed' | 'abandoned' | 'deferred';
  targetDate?: Timestamp;
  relatedPeople: string[];       // Who this commitment involves
  accountability: 'self' | 'shared' | 'to_other';
  originalStatement: string;     // What they actually said
}
```

### Graph Relationships

```typescript
/**
 * Relationship between entities
 */
interface EntityRelationship {
  id: string;
  fromEntity: string;            // Entity ID
  toEntity: string;              // Entity ID
  type: RelationshipType;
  strength: number;              // 0-1, how strong the connection
  
  // Temporal
  firstLinked: Timestamp;
  lastReinforced: Timestamp;
  reinforcementCount: number;
  
  // Context
  context?: string;              // Why they're related
  bidirectional: boolean;
}

type RelationshipType =
  | 'involves'        // Event involves Person
  | 'about'           // Commitment is about Topic
  | 'affects'         // Pattern affects Person
  | 'related_to'      // General association
  | 'causes'          // X causes Y (causal chain)
  | 'conflicts_with'  // Value conflicts with Commitment
  | 'supports'        // Dream supports Value
  | 'mentions'        // Memory mentions Person
  | 'preceded_by'     // Event preceded by Event (temporal)
  | 'followed_by';    // Event followed by Event (temporal)
```

---

## Retrieval System

### Graph-RAG Pipeline

```typescript
/**
 * Graph-RAG retrieval - state of the art hybrid search
 */
async function graphRAGRetrieve(
  userId: string,
  query: string,
  context: RetrievalContext
): Promise<RetrievedEntity[]> {
  
  // ═══════════════════════════════════════════════════════════════════════
  // STAGE 1: HYBRID INITIAL RETRIEVAL
  // Combine BM25 (keyword) + Vector (semantic) for initial candidates
  // ═══════════════════════════════════════════════════════════════════════
  
  const [bm25Results, vectorResults] = await Promise.all([
    // BM25 keyword search (catches exact matches like names)
    bm25Search(userId, query, { topK: 50 }),
    
    // Vector semantic search (catches meaning)
    vectorSearch(userId, await embed(query), { topK: 50 }),
  ]);
  
  // Reciprocal Rank Fusion (RRF) - proven to outperform single-method
  const fusedCandidates = reciprocalRankFusion([
    { results: bm25Results, weight: 0.4 },
    { results: vectorResults, weight: 0.6 },
  ], { topK: 30 });
  
  // ═══════════════════════════════════════════════════════════════════════
  // STAGE 2: GRAPH EXPANSION
  // Follow relationships to find related entities
  // ═══════════════════════════════════════════════════════════════════════
  
  const expandedEntities = new Map<string, ExpandedEntity>();
  
  for (const candidate of fusedCandidates) {
    // Add the direct match
    expandedEntities.set(candidate.id, {
      entity: candidate,
      distance: 0,
      path: [],
    });
    
    // Follow relationships 1-2 hops
    const related = await graphExpand(candidate.id, {
      maxDepth: 2,
      maxPerHop: 5,
      relationshipTypes: getRelevantRelationships(query, context),
    });
    
    for (const rel of related) {
      if (!expandedEntities.has(rel.entity.id)) {
        expandedEntities.set(rel.entity.id, rel);
      }
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════
  // STAGE 3: CROSS-ENCODER RERANKING
  // Score (query, entity) pairs with fine-tuned cross-encoder
  // Much more accurate than cosine similarity alone
  // ═══════════════════════════════════════════════════════════════════════
  
  const candidateList = Array.from(expandedEntities.values());
  
  const reranked = await crossEncoderRerank(
    query,
    candidateList.map(c => entityToText(c.entity)),
    { model: 'cross-encoder/ms-marco-MiniLM-L-6-v2', topK: 20 }
  );
  
  // ═══════════════════════════════════════════════════════════════════════
  // STAGE 4: TEMPORAL & EMOTIONAL WEIGHTING
  // Boost recent and emotionally significant
  // ═══════════════════════════════════════════════════════════════════════
  
  const weighted = reranked.map(result => {
    const entity = candidateList[result.originalIndex].entity;
    const graphDistance = candidateList[result.originalIndex].distance;
    
    // Temporal recency boost
    const daysSinceLastSeen = daysBetween(entity.lastSeen, now());
    const recencyScore = Math.exp(-daysSinceLastSeen / 30); // 30-day half-life
    
    // Emotional salience boost (decays slower)
    const daysSinceEmotionalPeak = daysBetween(
      entity.temporalContext.lastEmotionalPeak, 
      now()
    );
    const emotionalScore = Math.exp(-daysSinceEmotionalPeak / 90); // 90-day half-life
    
    // Graph distance penalty
    const graphPenalty = Math.pow(0.8, graphDistance); // 20% per hop
    
    // Combined score
    const finalScore = (
      result.score * 0.5 +          // Cross-encoder score
      recencyScore * 0.2 +          // Recency
      emotionalScore * 0.2 +        // Emotional salience
      entity.salienceScore * 0.1    // Overall importance
    ) * graphPenalty;
    
    return { entity, score: finalScore, reason: buildExplanation(entity, result) };
  });
  
  // ═══════════════════════════════════════════════════════════════════════
  // STAGE 5: CONTEXT ASSEMBLY
  // Build coherent narrative from retrieved entities
  // ═══════════════════════════════════════════════════════════════════════
  
  return weighted
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
}
```

### Hybrid Search Implementation

```typescript
/**
 * BM25 keyword search using Firestore full-text
 * Catches exact name matches that vector search might miss
 */
async function bm25Search(
  userId: string,
  query: string,
  options: { topK: number }
): Promise<Entity[]> {
  const tokens = tokenize(query);
  
  // Search canonical name and aliases
  const results = await db
    .collection('entities')
    .where('userId', '==', userId)
    .where('searchTokens', 'array-contains-any', tokens)
    .limit(options.topK * 2)
    .get();
    
  // Score by token overlap (simple BM25 approximation)
  return results.docs
    .map(doc => ({
      entity: doc.data() as Entity,
      bm25Score: computeBM25(tokens, doc.data().searchTokens),
    }))
    .sort((a, b) => b.bm25Score - a.bm25Score)
    .slice(0, options.topK)
    .map(r => r.entity);
}

/**
 * Reciprocal Rank Fusion - combine multiple ranked lists
 * Proven to outperform single-method retrieval
 */
function reciprocalRankFusion(
  rankedLists: Array<{ results: Entity[]; weight: number }>,
  options: { topK: number; k?: number }
): Entity[] {
  const k = options.k ?? 60; // RRF constant
  const scores = new Map<string, number>();
  
  for (const { results, weight } of rankedLists) {
    for (let rank = 0; rank < results.length; rank++) {
      const entity = results[rank];
      const rrfScore = weight / (k + rank + 1);
      scores.set(entity.id, (scores.get(entity.id) ?? 0) + rrfScore);
    }
  }
  
  return Array.from(scores.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, options.topK)
    .map(([id]) => entityCache.get(id)!);
}
```

---

## Proactive Surfacing Engine

### When to Surface (Not Just What)

```typescript
/**
 * Proactive Surfacing Engine
 * 
 * A superhuman friend doesn't just remember when asked -
 * they bring things up at exactly the right moment.
 */
class ProactiveSurfacingEngine {
  
  /**
   * Analyze current turn for proactive surfacing opportunities
   */
  async analyzeForSurfacing(
    userId: string,
    currentTurn: string,
    context: ConversationContext
  ): Promise<SurfacingOpportunity[]> {
    
    const opportunities: SurfacingOpportunity[] = [];
    
    // ═══════════════════════════════════════════════════════════════════════
    // 1. ENTITY MENTIONS
    // User mentioned someone/something we know about
    // ═══════════════════════════════════════════════════════════════════════
    
    const mentionedEntities = await this.extractAndLinkEntities(currentTurn, userId);
    
    for (const entity of mentionedEntities) {
      // Check for related information worth surfacing
      const related = await this.getRelatedWorthSurfacing(entity, context);
      
      if (related.length > 0) {
        opportunities.push({
          type: 'entity_context',
          entity,
          relatedInfo: related,
          timing: 'soon',          // Surface soon, not immediately
          naturalPhrasing: this.generateNaturalReference(entity, related),
        });
      }
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // 2. TEMPORAL TRIGGERS
    // Something time-relevant is coming up or just passed
    // ═══════════════════════════════════════════════════════════════════════
    
    const temporalTriggers = await this.checkTemporalTriggers(userId);
    
    for (const trigger of temporalTriggers) {
      // Only surface if user seems receptive
      const receptivity = await this.assessReceptivity(context, trigger);
      
      if (receptivity > 0.6) {
        opportunities.push({
          type: 'temporal',
          entity: trigger.entity,
          timing: trigger.urgency,
          naturalPhrasing: trigger.suggestedPhrasing,
          receptivityScore: receptivity,
        });
      }
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // 3. PATTERN DETECTION
    // We notice a pattern the user might not
    // ═══════════════════════════════════════════════════════════════════════
    
    const patterns = await this.detectCrossSessionPatterns(userId, currentTurn);
    
    for (const pattern of patterns) {
      // Only surface patterns with high confidence and value
      if (pattern.confidence > 0.8 && pattern.insightValue > 0.7) {
        opportunities.push({
          type: 'pattern_insight',
          pattern,
          timing: 'when_relevant',
          naturalPhrasing: pattern.surfacingPhrase,
        });
      }
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // 4. COMMITMENT TRACKING
    // They made a commitment we should check in on
    // ═══════════════════════════════════════════════════════════════════════
    
    const commitments = await this.checkCommitmentOpportunities(userId, context);
    
    for (const commitment of commitments) {
      opportunities.push({
        type: 'commitment_checkin',
        entity: commitment,
        timing: commitment.checkInTiming,
        naturalPhrasing: commitment.suggestedCheckin,
      });
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // 5. CAUSAL AWARENESS
    // This topic led to something before
    // ═══════════════════════════════════════════════════════════════════════
    
    const causalChains = await this.findCausalChains(userId, currentTurn);
    
    for (const chain of causalChains) {
      opportunities.push({
        type: 'causal_awareness',
        chain,
        timing: 'if_continues',    // Only if conversation continues this way
        naturalPhrasing: chain.gentleReminder,
      });
    }
    
    return this.prioritizeAndFilter(opportunities, context);
  }
  
  /**
   * Assess user receptivity to surfacing
   * 
   * Even if we HAVE relevant info, is now the right TIME?
   */
  private async assessReceptivity(
    context: ConversationContext,
    content: SurfacingContent
  ): Promise<number> {
    let receptivity = 0.5; // Base receptivity
    
    // Boost if user is in exploratory mode
    if (context.conversationMood === 'exploratory') {
      receptivity += 0.2;
    }
    
    // Reduce if user is venting (don't interrupt)
    if (context.conversationMood === 'venting') {
      receptivity -= 0.3;
    }
    
    // Reduce if we've surfaced a lot already this session
    if (context.surfacingCountThisSession > 3) {
      receptivity -= 0.2;
    }
    
    // Boost if content is high-urgency
    if (content.urgency === 'high') {
      receptivity += 0.2;
    }
    
    // Boost if user asked a question (they're seeking info)
    if (context.lastTurnWasQuestion) {
      receptivity += 0.1;
    }
    
    // Clamp to [0, 1]
    return Math.max(0, Math.min(1, receptivity));
  }
}
```

---

## Memory Consolidation

### Automatic Memory Merging

```typescript
/**
 * Memory Consolidation Service
 * 
 * Like human sleep consolidates memories, we periodically:
 * - Merge similar entities
 * - Decay unimportant memories
 * - Strengthen important ones
 * - Build higher-level patterns
 */
class MemoryConsolidationService {
  
  /**
   * Run nightly consolidation for a user
   */
  async consolidate(userId: string): Promise<ConsolidationReport> {
    const report: ConsolidationReport = {
      mergedEntities: 0,
      decayedEntities: 0,
      strengthenedEntities: 0,
      newPatternsDetected: 0,
    };
    
    // ═══════════════════════════════════════════════════════════════════════
    // 1. MERGE SIMILAR ENTITIES
    // "my mom" and "mother" and "mom Sarah" → single entity
    // ═══════════════════════════════════════════════════════════════════════
    
    const entities = await this.loadUserEntities(userId);
    const clusters = await this.clusterSimilarEntities(entities);
    
    for (const cluster of clusters) {
      if (cluster.length > 1 && cluster.similarityScore > 0.9) {
        const merged = await this.mergeEntities(cluster);
        report.mergedEntities++;
      }
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // 2. APPLY DECAY
    // Reduce salience of old, low-importance memories
    // ═══════════════════════════════════════════════════════════════════════
    
    for (const entity of entities) {
      const daysSinceLastSeen = daysBetween(entity.lastSeen, now());
      
      // Skip if emotionally significant (resists decay)
      if (entity.emotionalWeight > 0.7) continue;
      
      // Skip if frequently mentioned
      if (entity.mentionCount > 10) continue;
      
      // Apply decay
      if (daysSinceLastSeen > 60 && entity.salienceScore > 0.3) {
        await this.decayEntity(entity);
        report.decayedEntities++;
      }
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // 3. STRENGTHEN FREQUENTLY REINFORCED
    // Things mentioned often get stronger
    // ═══════════════════════════════════════════════════════════════════════
    
    const recentMentions = await this.getRecentMentions(userId, { days: 7 });
    
    for (const [entityId, mentionCount] of recentMentions) {
      if (mentionCount >= 3) {
        await this.strengthenEntity(entityId);
        report.strengthenedEntities++;
      }
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // 4. DETECT EMERGING PATTERNS
    // Build higher-level understanding from raw memories
    // ═══════════════════════════════════════════════════════════════════════
    
    const patterns = await this.detectPatterns(userId, entities);
    
    for (const pattern of patterns) {
      if (pattern.confidence > 0.75 && !pattern.alreadyKnown) {
        await this.createPatternEntity(userId, pattern);
        report.newPatternsDetected++;
      }
    }
    
    return report;
  }
  
  /**
   * Cluster entities by semantic similarity
   */
  private async clusterSimilarEntities(
    entities: Entity[]
  ): Promise<EntityCluster[]> {
    // Use HDBSCAN or similar for density-based clustering
    const embeddings = entities.map(e => e.embedding);
    
    const clusters = hdbscan(embeddings, {
      minClusterSize: 2,
      minSamples: 1,
      metric: 'cosine',
    });
    
    return clusters.map(indices => ({
      entities: indices.map(i => entities[i]),
      similarityScore: computeClusterCohesion(indices.map(i => embeddings[i])),
    }));
  }
}
```

---

## Migration Strategy

### Phase 1: Entity Store Foundation (Week 1-2)

```typescript
// Create unified entity store
await db.collection('entities').doc(entityId).set({
  userId,
  type: 'person',
  canonicalName: 'Mike',
  aliases: ['brother', 'my brother', 'Mike'],
  // ... full schema
});

// Create relationship
await db.collection('entity_relationships').doc(relationshipId).set({
  fromEntity: mikeId,
  toEntity: surgeryEventId,
  type: 'involves',
});
```

### Phase 2: Migration Pipeline (Week 2-3)

```typescript
/**
 * Migrate from fragmented collections to unified entity store
 */
async function migrateUserToUnifiedEntities(userId: string): Promise<void> {
  // Load from ALL existing collections
  const [
    contacts,
    contactRelationships,
    relationshipNetwork,
    commitments,
    dreams,
    values,
    patterns,
    // ... all 50+ collections
  ] = await Promise.all([
    loadUserContacts(userId),
    loadContactRelationships(userId),
    loadRelationshipNetwork(userId),
    loadCommitments(userId),
    loadDreams(userId),
    loadValues(userId),
    loadPatterns(userId),
  ]);
  
  // Deduplicate and merge into entities
  const entityMerger = new EntityMerger();
  
  // Add contacts
  for (const contact of contacts) {
    entityMerger.addSource({
      type: 'person',
      canonicalName: contact.displayName,
      aliases: contact.nicknames || [],
      attributes: {
        relationship: contact.relationship,
        phone: contact.phones?.[0]?.number,
        email: contact.emails?.[0]?.address,
      },
      source: 'user_contacts',
    });
  }
  
  // Add relationship network entries
  for (const person of relationshipNetwork) {
    entityMerger.addSource({
      type: 'person',
      canonicalName: person.name,
      aliases: [person.relationship, person.nickname].filter(Boolean),
      attributes: {
        relationship: person.type,
        sentiment: person.sentiment,
      },
      source: 'relationship_network',
    });
  }
  
  // Merge duplicates
  const mergedEntities = entityMerger.merge();
  
  // Write to unified store
  const batch = db.batch();
  for (const entity of mergedEntities) {
    const ref = db.collection('entities').doc();
    batch.set(ref, entity);
  }
  await batch.commit();
  
  // Create relationships between entities
  await createEntityRelationships(userId, mergedEntities);
}
```

### Phase 3: Dual-Write Period (Week 3-4)

```typescript
/**
 * During migration, write to both old and new systems
 */
async function saveContact(userId: string, contact: Contact): Promise<void> {
  // Write to old system (for backwards compatibility)
  await db.collection('user_contacts').doc(contact.id).set(contact);
  
  // Write to new unified system
  const entity = contactToEntity(contact);
  await db.collection('entities').doc(entity.id).set(entity);
  
  // Create relationships
  if (contact.relationship) {
    await linkEntityToUser(entity.id, userId, contact.relationship);
  }
}
```

### Phase 4: Full Cutover (Week 5)

```typescript
/**
 * Switch retrieval to use unified entity store
 */
async function searchUserMemory(
  userId: string,
  query: string
): Promise<SearchResult[]> {
  // Use new Graph-RAG retrieval
  return graphRAGRetrieve(userId, query, { /* context */ });
  
  // OLD: Fragmented search across 50+ collections
  // const [contacts, commitments, ...] = await Promise.all([...]);
}
```

---

## Success Metrics

| Metric | Current | Target | Measurement |
|--------|---------|--------|-------------|
| **Retrieval Accuracy** | ~60% | >90% | Does retrieved memory match intent? |
| **Entity Resolution** | ~40% | >95% | "my brother" → correct entity |
| **Cross-Domain Recall** | ~20% | >80% | Find Mike across all contexts |
| **Proactive Surfacing** | ~10% | >50% | Relevant unprompted surfacing |
| **Memory Latency p95** | ~300ms | <150ms | Graph-RAG query time |
| **User "Feel Known"** | ? | >4.5/5 | Survey: "Ferni remembers me" |

---

## Technical Implementation Details

### Firestore Collections (New Schema)

```
entities/{entityId}
├── userId: string
├── type: EntityType
├── canonicalName: string
├── aliases: string[]
├── embedding: vector(1536)
├── contextualEmbeddings: { asSubject, asObject, inEmotion }
├── temporalContext: { ... }
├── salienceScore: number
├── attributes: { type-specific }
└── searchTokens: string[]  (for BM25)

entity_relationships/{relationshipId}
├── fromEntity: string
├── toEntity: string
├── type: RelationshipType
├── strength: number
├── firstLinked: timestamp
├── lastReinforced: timestamp
└── context: string

entity_mentions/{mentionId}
├── entityId: string
├── conversationId: string
├── timestamp: timestamp
├── snippet: string
├── emotionalWeight: number
└── personaId: string
```

### Vector Index Configuration

```yaml
# Firestore vector index for semantic search
indexes:
  - collection: entities
    queryScope: COLLECTION
    fields:
      - fieldPath: userId
        order: ASCENDING
      - fieldPath: embedding
        vectorConfig:
          dimension: 1536
          flat: {}
```

### Cross-Encoder Setup

```typescript
// Use sentence-transformers cross-encoder for reranking
// Model: cross-encoder/ms-marco-MiniLM-L-6-v2 (fast, good quality)
// Or: cross-encoder/ms-marco-TinyBERT-L-2-v2 (faster, slightly less accurate)

import { CrossEncoder } from '@xenova/transformers';

const crossEncoder = await CrossEncoder.from('cross-encoder/ms-marco-MiniLM-L-6-v2');

async function crossEncoderRerank(
  query: string,
  candidates: string[],
  topK: number
): Promise<RerankResult[]> {
  const pairs = candidates.map(c => [query, c]);
  const scores = await crossEncoder.predict(pairs);
  
  return scores
    .map((score, index) => ({ score, originalIndex: index }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}
```

---

## Next Steps

1. **Week 1**: Implement Entity schema and store
2. **Week 2**: Implement Graph-RAG retrieval pipeline
3. **Week 3**: Build migration scripts from legacy collections
4. **Week 4**: Implement proactive surfacing engine
5. **Week 5**: Memory consolidation service
6. **Week 6**: Full cutover and deprecate legacy collections

---

## References

- [Microsoft Graph-RAG](https://www.microsoft.com/en-us/research/blog/graphrag-unlocking-llm-discovery-on-narrative-private-data/) - Graph + RAG hybrid
- [ColBERT](https://arxiv.org/abs/2004.12832) - Late interaction for retrieval
- [Reciprocal Rank Fusion](https://plg.uwaterloo.ca/~gvcormac/cormacksigir09-rrf.pdf) - Combining ranked lists
- [Cross-Encoders for Reranking](https://www.sbert.net/examples/applications/cross-encoder/README.html) - SBERT guide
