# Unified Memory Architecture: Better Than Human

> **"Your best friend forgets. Your therapist has other patients. Your mentor has blind spots. We have none of these limitations."**

This document defines a comprehensive, entity-centric memory architecture that transforms Ferni from a feature-fragmented system into a unified knowledge graph with superhuman recall capabilities.

---

## Executive Summary

### The Problem

The current system stores user data in **50+ separate Firestore subcollections** organized by *feature*, not by *entity*:

```
bogle_users/{userId}/
├── relationship_network/     # Superhuman service
├── contact_relationships/    # Telephony service  
├── user_contacts/            # Data capture
├── relationship_nodes/       # Graph service
├── network/relationships     # Research tools
├── guest_profiles/           # Jordan's planning
└── ... 44 more collections
```

**Result:** When a user says "my brother Mike is having surgery next week", the data fragments across multiple collections with no linking. We cannot answer "What do we know about Mike?"

### The Solution

A **Unified Knowledge Graph** that:
1. Stores entities (people, places, events, concepts) as first-class nodes
2. Links all mentions/facts to their entities
3. Enables cross-domain queries ("Everything about Mike")
4. Supports temporal reasoning ("How has this evolved?")
5. Powers proactive intelligence ("Surface this when relevant")

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           UNIFIED KNOWLEDGE GRAPH                                │
│                                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │   ENTITIES   │◄──►│   MENTIONS   │◄──►│   THREADS    │◄──►│  INSIGHTS    │  │
│  │              │    │              │    │              │    │              │  │
│  │ People       │    │ When said    │    │ Topic arcs   │    │ Patterns     │  │
│  │ Places       │    │ What context │    │ Across time  │    │ Correlations │  │
│  │ Events       │    │ Emotion      │    │ Open loops   │    │ Predictions  │  │
│  │ Concepts     │    │ Source       │    │              │    │              │  │
│  │ Goals        │    │              │    │              │    │              │  │
│  └──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘  │
│         │                   │                   │                   │          │
│         └───────────────────┴───────────────────┴───────────────────┘          │
│                                      │                                          │
│                          ┌───────────┴───────────┐                              │
│                          │   ENTITY EMBEDDINGS   │                              │
│                          │   (Unified Semantic)  │                              │
│                          └───────────────────────┘                              │
└─────────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          QUERY & INTELLIGENCE LAYER                             │
│                                                                                  │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐                 │
│  │ Entity Resolver │  │ Temporal Query  │  │ Proactive Engine│                 │
│  │                 │  │                 │  │                 │                 │
│  │ "Mike" → which  │  │ "When did..."  │  │ "Surface when   │                 │
│  │ Mike?           │  │ "How evolved?" │  │ relevant"       │                 │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘                 │
│                                                                                  │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐                 │
│  │ Cross-Domain    │  │ Correlation     │  │ Pattern         │                 │
│  │ Query           │  │ Mining          │  │ Detection       │                 │
│  │                 │  │                 │  │                 │                 │
│  │ "Everything     │  │ "X correlates   │  │ "They always..." │                 │
│  │ about X"        │  │ with Y"         │  │                 │                 │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘                 │
└─────────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           STORAGE LAYER                                          │
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                         FIRESTORE                                        │   │
│  │                                                                          │   │
│  │  knowledge_graph/{userId}/                                               │   │
│  │  ├── entities/           # All entities (people, places, events...)     │   │
│  │  ├── mentions/           # All mentions with temporal data              │   │
│  │  ├── relationships/      # Entity-to-entity edges                       │   │
│  │  ├── threads/            # Conversation threads over time               │   │
│  │  ├── insights/           # Generated insights & patterns                │   │
│  │  └── embeddings/         # Unified vector embeddings                    │   │
│  │                                                                          │   │
│  │  legacy_collections/     # Existing 50+ collections (read-only)         │   │
│  │                                                                          │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐                 │
│  │ Redis Cache     │  │ In-Memory L1    │  │ Background Jobs │                 │
│  │ (Hot entities)  │  │ (Session)       │  │ (Consolidation) │                 │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Core Data Models

### 1. Entity

The fundamental unit of knowledge - a person, place, event, concept, or goal.

```typescript
// src/memory/knowledge-graph/types.ts

/**
 * EntityType - What kind of thing is this?
 */
export type EntityType = 
  | 'person'      // Someone in user's life
  | 'place'       // Location (home, office, vacation spot)
  | 'event'       // Past or future event (wedding, surgery, meeting)
  | 'concept'     // Abstract idea (career, relationship, health)
  | 'goal'        // Something user wants to achieve
  | 'commitment'  // Promise or intention
  | 'dream'       // Long-term aspiration
  | 'value'       // Core value (family, honesty, growth)
  | 'pattern'     // Behavioral pattern
  | 'memory';     // Significant memory/moment

/**
 * Entity - A node in the knowledge graph
 */
export interface Entity {
  id: string;                    // Unique identifier
  userId: string;                // Owner
  type: EntityType;              // What kind of entity
  
  // Identity
  canonicalName: string;         // Primary name ("Mike")
  aliases: string[];             // Other names ("Michael", "brother", "my bro")
  description?: string;          // Brief description
  
  // Classification (for people)
  relationship?: RelationshipType; // family, friend, colleague, etc.
  specificRelation?: string;       // "brother", "boss", "therapist"
  
  // Temporal
  createdAt: Date;               // When first mentioned
  updatedAt: Date;               // Last updated
  firstMentionedAt: Date;        // When user first mentioned them
  lastMentionedAt: Date;         // Most recent mention
  mentionCount: number;          // How often mentioned
  
  // Importance
  salience: number;              // 0-1, how important to user
  emotionalWeight: number;       // 0-1, emotional significance
  
  // Semantic
  embedding: number[];           // Vector embedding for similarity
  topics: string[];              // Associated topics
  
  // Contact info (for people)
  contact?: {
    phone?: string;
    email?: string;
    address?: string;
  };
  
  // Metadata
  source: EntitySource;          // How was this entity created
  confidence: number;            // 0-1, how confident in entity existence
  mergedFrom?: string[];         // If consolidated from multiple entities
}

export type EntitySource = 
  | 'conversation'     // Extracted from conversation
  | 'explicit'         // User explicitly created
  | 'calendar'         // From calendar integration
  | 'contacts'         // From contacts import
  | 'inferred';        // Inferred from context

export type RelationshipType = 
  | 'family'
  | 'friend'
  | 'colleague'
  | 'romantic'
  | 'professional'
  | 'acquaintance'
  | 'other';
```

### 2. Mention

Every time an entity is mentioned or referenced.

```typescript
/**
 * Mention - A reference to an entity in conversation
 */
export interface Mention {
  id: string;
  userId: string;
  entityId: string;              // Which entity was mentioned
  
  // Context
  transcript: string;            // The actual text
  sessionId: string;             // Which conversation
  turnNumber: number;            // Which turn in conversation
  personaId: string;             // Which persona was active
  
  // Temporal
  timestamp: Date;               // When mentioned
  
  // Semantic
  topics: string[];              // Topics in this mention
  sentiment: number;             // -1 to 1, how they felt about entity
  emotionalIntensity: number;    // 0-1, how emotional the mention
  
  // Classification
  mentionType: MentionType;      // What kind of mention
  
  // Extracted facts
  facts: ExtractedFact[];        // New information learned
  
  // Embedding for semantic search
  embedding: number[];
}

export type MentionType =
  | 'reference'       // Simple reference ("I saw Mike")
  | 'story'           // Story about entity ("Mike did something funny")
  | 'emotion'         // Emotional content ("I'm worried about Mike")
  | 'fact'            // New fact ("Mike lives in Chicago")
  | 'update'          // Status update ("Mike got promoted")
  | 'planning'        // Future planning ("Meeting Mike tomorrow")
  | 'reflection';     // Reflecting on relationship

export interface ExtractedFact {
  type: 'attribute' | 'event' | 'relationship' | 'state';
  key: string;                   // What kind of fact
  value: string;                 // The fact itself
  confidence: number;            // 0-1
  validFrom?: Date;              // When this became true
  validUntil?: Date;             // When this stopped being true (if known)
}
```

### 3. Relationship (Edge)

Connections between entities.

```typescript
/**
 * EntityRelationship - An edge in the knowledge graph
 */
export interface EntityRelationship {
  id: string;
  userId: string;
  
  // The connection
  fromEntityId: string;          // Source entity
  toEntityId: string;            // Target entity
  relationshipType: EdgeType;    // How they're connected
  
  // Details
  label?: string;                // Human-readable label
  strength: number;              // 0-1, how strong the connection
  sentiment: number;             // -1 to 1, positive/negative
  
  // Temporal
  createdAt: Date;
  updatedAt: Date;
  lastMentionedAt: Date;
  
  // Evidence
  mentionIds: string[];          // Mentions that support this edge
}

export type EdgeType =
  // Person-to-person
  | 'knows'           // Generic connection
  | 'family_of'       // Family relationship
  | 'friend_of'       // Friendship
  | 'works_with'      // Professional
  | 'reports_to'      // Hierarchy
  | 'romantic_with'   // Romantic
  
  // Person-to-thing
  | 'interested_in'   // Interest/hobby
  | 'worried_about'   // Concern
  | 'wants'           // Desire/goal
  | 'committed_to'    // Commitment
  | 'values'          // Core value
  
  // Thing-to-thing
  | 'related_to'      // Generic relation
  | 'causes'          // Causal relationship
  | 'part_of'         // Hierarchical
  | 'blocks'          // Conflict
  | 'enables';        // Dependency
```

### 4. Thread

A conversation arc that spans multiple sessions.

```typescript
/**
 * Thread - A topic arc across time
 */
export interface Thread {
  id: string;
  userId: string;
  
  // Identity
  topic: string;                 // Main topic
  relatedTopics: string[];       // Related topics
  
  // Entities involved
  entityIds: string[];           // Entities mentioned in this thread
  
  // Timeline
  sessions: ThreadSession[];     // Sessions where discussed
  
  // State
  status: ThreadStatus;
  
  // Open loops
  openQuestions: string[];       // Things to follow up on
  pendingActions: string[];      // Actions user mentioned
  
  // Temporal
  createdAt: Date;
  lastUpdatedAt: Date;
  
  // Importance
  salience: number;              // 0-1
  emotionalWeight: number;       // 0-1
  
  // Embedding
  embedding: number[];
}

export interface ThreadSession {
  sessionId: string;
  date: Date;
  summary: string;
  emotionalArc: string;          // How emotions evolved
  keyMoments: string[];          // Highlights
  turnRange: [number, number];   // Which turns
}

export type ThreadStatus =
  | 'active'          // Currently being discussed
  | 'open'            // Has open questions/actions
  | 'resolved'        // Topic concluded
  | 'dormant'         // Not discussed recently
  | 'recurring';      // Comes up repeatedly
```

### 5. Insight

Generated patterns, correlations, and predictions.

```typescript
/**
 * Insight - A superhuman observation
 */
export interface Insight {
  id: string;
  userId: string;
  
  // Type
  insightType: InsightType;
  
  // Content
  title: string;                 // Brief title
  description: string;           // Full description
  evidence: string[];            // Supporting evidence
  
  // Entities involved
  entityIds: string[];
  mentionIds: string[];
  
  // Confidence & Importance
  confidence: number;            // 0-1
  salience: number;              // 0-1
  actionability: number;         // 0-1, how actionable
  
  // Timing
  createdAt: Date;
  validFrom?: Date;              // When insight applies
  validUntil?: Date;             // Expiration
  
  // Surfacing
  surfacedCount: number;         // Times shown to user
  lastSurfacedAt?: Date;
  receptivityThreshold: number;  // Min receptivity to surface
  
  // User feedback
  userFeedback?: 'helpful' | 'not_helpful' | 'wrong';
}

export type InsightType =
  // Patterns
  | 'behavioral_pattern'      // "You tend to X when Y"
  | 'temporal_pattern'        // "This happens every Sunday"
  | 'emotional_pattern'       // "X topic triggers stress"
  
  // Correlations
  | 'correlation'             // "X and Y seem connected"
  | 'causation'               // "X seems to cause Y"
  
  // Predictions
  | 'prediction'              // "You might feel X soon"
  | 'risk'                    // "Watch out for X"
  | 'opportunity'             // "Good time for X"
  
  // Reflections
  | 'growth'                  // "You've grown in X"
  | 'contradiction'           // "You say X but do Y"
  | 'milestone'               // "Achievement unlocked"
  
  // Recommendations
  | 'suggestion'              // "Consider X"
  | 'reminder';               // "Don't forget X"
```

---

## Services Architecture

### 1. Entity Resolver

Resolves mentions to canonical entities, handling ambiguity.

```typescript
// src/memory/knowledge-graph/services/entity-resolver.ts

export interface EntityResolver {
  /**
   * Resolve a mention to an entity (or create new)
   */
  resolve(
    userId: string,
    mention: {
      text: string;           // "my brother"
      context: string;        // Full transcript
      embedding: number[];    // Pre-computed embedding
    }
  ): Promise<ResolvedEntity>;
  
  /**
   * Find entity by any alias
   */
  findByAlias(userId: string, alias: string): Promise<Entity | null>;
  
  /**
   * Get disambiguation candidates
   */
  getCandidates(userId: string, text: string): Promise<Entity[]>;
  
  /**
   * Merge duplicate entities
   */
  merge(userId: string, entityIds: string[]): Promise<Entity>;
}

interface ResolvedEntity {
  entity: Entity;
  confidence: number;
  isNew: boolean;
  alternativeCandidates?: Entity[];
}
```

**Implementation Strategy:**

```typescript
async function resolve(userId: string, mention: MentionInput): Promise<ResolvedEntity> {
  // 1. Exact alias match
  const exactMatch = await findByAlias(userId, mention.text);
  if (exactMatch && exactMatch.confidence > 0.9) {
    return { entity: exactMatch, confidence: 0.95, isNew: false };
  }
  
  // 2. Semantic similarity search
  const semanticCandidates = await vectorSearch(userId, mention.embedding, {
    topK: 5,
    threshold: 0.7,
  });
  
  // 3. Context disambiguation
  if (semanticCandidates.length > 1) {
    const disambiguated = await disambiguateByContext(
      mention.context,
      semanticCandidates
    );
    if (disambiguated.confidence > 0.8) {
      return disambiguated;
    }
  }
  
  // 4. Single high-confidence match
  if (semanticCandidates.length === 1 && semanticCandidates[0].score > 0.85) {
    return { 
      entity: semanticCandidates[0].entity, 
      confidence: semanticCandidates[0].score,
      isNew: false 
    };
  }
  
  // 5. Create new entity
  const newEntity = await createEntity(userId, {
    canonicalName: extractName(mention.text),
    aliases: [mention.text],
    source: 'conversation',
    ...inferAttributes(mention)
  });
  
  return { entity: newEntity, confidence: 0.7, isNew: true };
}
```

### 2. Knowledge Capture Service

Extracts entities, facts, and relationships from conversation in real-time.

```typescript
// src/memory/knowledge-graph/services/knowledge-capture.ts

export interface KnowledgeCaptureService {
  /**
   * Process a conversation turn
   */
  captureTurn(input: TurnCaptureInput): Promise<CaptureResult>;
  
  /**
   * Extract entities from text
   */
  extractEntities(text: string, context: CaptureContext): Promise<ExtractedEntity[]>;
  
  /**
   * Extract facts about entities
   */
  extractFacts(text: string, entities: Entity[]): Promise<ExtractedFact[]>;
  
  /**
   * Extract relationships between entities
   */
  extractRelationships(
    text: string, 
    entities: Entity[]
  ): Promise<ExtractedRelationship[]>;
}

interface TurnCaptureInput {
  userId: string;
  sessionId: string;
  turnNumber: number;
  transcript: string;
  personaId: string;
  emotion?: EmotionalState;
}

interface CaptureResult {
  entities: {
    created: Entity[];
    updated: Entity[];
    resolved: ResolvedEntity[];
  };
  mentions: Mention[];
  facts: ExtractedFact[];
  relationships: EntityRelationship[];
  threads: {
    continued: Thread[];
    created: Thread[];
  };
}
```

**LLM-Assisted Extraction:**

```typescript
const EXTRACTION_PROMPT = `
You are an expert at understanding human relationships and extracting structured information.

Given this conversation turn, extract:

1. ENTITIES mentioned (people, places, events, concepts)
   - Name/identifier
   - Type (person, place, event, concept, goal)
   - Relationship to user (if person)
   - Any attributes mentioned

2. FACTS learned
   - What new information did we learn?
   - About which entity?
   - How confident are we?

3. RELATIONSHIPS between entities
   - Who/what is connected to who/what?
   - What's the nature of the connection?

4. EMOTIONAL CONTEXT
   - How does the user feel about each entity?
   - Any changes in sentiment?

Transcript: "{transcript}"
Context: "{previous_context}"

Return as JSON matching the schema.
`;
```

### 3. Cross-Domain Query Engine

Enables queries across all stored knowledge.

```typescript
// src/memory/knowledge-graph/services/query-engine.ts

export interface QueryEngine {
  /**
   * Query everything about an entity
   */
  queryEntity(
    userId: string,
    query: EntityQuery
  ): Promise<EntityQueryResult>;
  
  /**
   * Semantic search across all knowledge
   */
  semanticSearch(
    userId: string,
    query: string,
    options?: SearchOptions
  ): Promise<SearchResult[]>;
  
  /**
   * Find related entities
   */
  findRelated(
    userId: string,
    entityId: string,
    depth?: number
  ): Promise<RelatedEntitiesResult>;
  
  /**
   * Query temporal patterns
   */
  queryTemporal(
    userId: string,
    query: TemporalQuery
  ): Promise<TemporalResult>;
  
  /**
   * Natural language query
   */
  naturalQuery(
    userId: string,
    question: string
  ): Promise<NaturalQueryResult>;
}

interface EntityQuery {
  entityId?: string;
  name?: string;
  type?: EntityType;
  includeRelated?: boolean;
  includeMentions?: boolean;
  includeInsights?: boolean;
  timeRange?: { start: Date; end: Date };
}

interface EntityQueryResult {
  entity: Entity;
  mentions: Mention[];
  facts: ExtractedFact[];
  relationships: EntityRelationship[];
  relatedEntities: Entity[];
  threads: Thread[];
  insights: Insight[];
  timeline: TimelineEvent[];
}
```

**"What Do We Know About X?" Query:**

```typescript
async function whatDoWeKnowAbout(
  userId: string,
  name: string
): Promise<EntityQueryResult> {
  // 1. Resolve to canonical entity
  const entity = await entityResolver.findByAlias(userId, name);
  if (!entity) {
    return { entity: null, suggestions: await getSimilarEntities(userId, name) };
  }
  
  // 2. Get all mentions
  const mentions = await getMentions(userId, entity.id, { limit: 100 });
  
  // 3. Get all facts
  const facts = await getFacts(userId, entity.id);
  
  // 4. Get relationships (graph traversal)
  const relationships = await getRelationships(userId, entity.id);
  const relatedEntities = await getRelatedEntities(userId, entity.id, { depth: 2 });
  
  // 5. Get threads involving this entity
  const threads = await getThreads(userId, { entityId: entity.id });
  
  // 6. Get insights about this entity
  const insights = await getInsights(userId, { entityId: entity.id });
  
  // 7. Build timeline
  const timeline = buildTimeline(mentions, facts, relationships);
  
  return {
    entity,
    mentions,
    facts,
    relationships,
    relatedEntities,
    threads,
    insights,
    timeline
  };
}
```

### 4. Proactive Intelligence Service

Determines what to surface and when.

```typescript
// src/memory/knowledge-graph/services/proactive-intelligence.ts

export interface ProactiveIntelligenceService {
  /**
   * Get proactive prompts for session start
   */
  getSessionPriming(
    userId: string,
    context: SessionContext
  ): Promise<ProactivePriming>;
  
  /**
   * Check for proactive triggers on each turn
   */
  checkTurnTriggers(
    userId: string,
    turn: TurnContext
  ): Promise<ProactiveTrigger[]>;
  
  /**
   * Calculate receptivity score
   */
  calculateReceptivity(
    userId: string,
    context: ReceptivityContext
  ): Promise<ReceptivityScore>;
  
  /**
   * Get timed triggers (follow-ups, reminders)
   */
  getTimedTriggers(userId: string): Promise<TimedTrigger[]>;
}

interface ProactivePriming {
  // High-priority items
  urgentFollowUps: ProactiveItem[];      // Commitments due soon
  openLoops: ProactiveItem[];            // Unfinished conversations
  
  // Contextual items
  relevantToday: ProactiveItem[];        // Date-relevant memories
  recentUpdates: ProactiveItem[];        // Things that changed
  
  // Relationship items
  peopleToAskAbout: ProactiveItem[];     // Haven't asked about in a while
  milestonesToCelebrate: ProactiveItem[]; // Achievements
  
  // Insight items
  patternsToSurface: ProactiveItem[];    // Ready-to-share patterns
  predictionsActive: ProactiveItem[];    // Current predictions
}

interface ProactiveItem {
  type: string;
  content: string;
  entity?: Entity;
  priority: number;            // 0-1
  naturalPhrasing: string;     // How to bring it up naturally
  timing: ProactiveTiming;
}

interface ProactiveTiming {
  surfaceWhen: 'session_start' | 'topic_relevant' | 'natural_pause' | 'explicit_trigger';
  receptivityThreshold: number;
  maxSurfaceAttempts: number;
  cooldownHours: number;
}
```

**Surfacing Decision Logic:**

```typescript
async function shouldSurface(
  item: ProactiveItem,
  context: SurfacingContext
): Promise<SurfacingDecision> {
  // 1. Check receptivity
  const receptivity = await calculateReceptivity(context.userId, {
    energy: context.detectedEnergy,
    stress: context.detectedStress,
    timeOfDay: new Date().getHours(),
    conversationDepth: context.turnNumber,
    currentEmotion: context.emotion,
  });
  
  if (receptivity.score < item.timing.receptivityThreshold) {
    return { shouldSurface: false, reason: 'receptivity_too_low' };
  }
  
  // 2. Check cooldown
  if (item.lastSurfacedAt && hoursSince(item.lastSurfacedAt) < item.timing.cooldownHours) {
    return { shouldSurface: false, reason: 'cooldown_active' };
  }
  
  // 3. Check surface attempts
  if (item.surfaceAttempts >= item.timing.maxSurfaceAttempts) {
    return { shouldSurface: false, reason: 'max_attempts_reached' };
  }
  
  // 4. Check topic relevance
  const topicRelevance = await calculateTopicRelevance(
    item,
    context.currentTopic,
    context.recentTopics
  );
  
  // 5. Natural moment detection
  const naturalMoment = await detectNaturalMoment(context);
  
  return {
    shouldSurface: true,
    confidence: (receptivity.score + topicRelevance + naturalMoment) / 3,
    suggestedPhrasing: await generateNaturalPhrasing(item, context),
  };
}
```

### 5. Insight Generation Service

Generates patterns, correlations, and predictions.

```typescript
// src/memory/knowledge-graph/services/insight-generation.ts

export interface InsightGenerationService {
  /**
   * Generate insights for a user (background job)
   */
  generateInsights(userId: string): Promise<GeneratedInsights>;
  
  /**
   * Detect patterns across mentions
   */
  detectPatterns(userId: string): Promise<Pattern[]>;
  
  /**
   * Find correlations between entities/topics
   */
  findCorrelations(userId: string): Promise<Correlation[]>;
  
  /**
   * Generate predictions
   */
  generatePredictions(userId: string): Promise<Prediction[]>;
  
  /**
   * Detect growth/changes over time
   */
  detectGrowth(userId: string): Promise<GrowthObservation[]>;
}

interface GeneratedInsights {
  patterns: Insight[];
  correlations: Insight[];
  predictions: Insight[];
  growth: Insight[];
  recommendations: Insight[];
}
```

**Pattern Detection Examples:**

```typescript
const PATTERN_DETECTORS = [
  // Temporal patterns
  {
    name: 'weekly_pattern',
    detect: async (mentions: Mention[]) => {
      const byDayOfWeek = groupBy(mentions, m => getDayOfWeek(m.timestamp));
      // Find significant spikes on certain days
      return findTemporalSpikes(byDayOfWeek);
    }
  },
  
  // Emotional patterns
  {
    name: 'emotion_entity_correlation',
    detect: async (mentions: Mention[], entities: Entity[]) => {
      // Find entities that correlate with certain emotions
      const correlations = [];
      for (const entity of entities) {
        const entityMentions = mentions.filter(m => m.entityId === entity.id);
        const avgSentiment = average(entityMentions.map(m => m.sentiment));
        if (Math.abs(avgSentiment) > 0.5) {
          correlations.push({
            entity,
            sentiment: avgSentiment,
            confidence: calculateConfidence(entityMentions.length),
          });
        }
      }
      return correlations;
    }
  },
  
  // Behavioral patterns
  {
    name: 'topic_avoidance',
    detect: async (threads: Thread[]) => {
      // Find topics that get started but never resolved
      return threads
        .filter(t => t.status === 'dormant' && t.openQuestions.length > 0)
        .map(t => ({
          topic: t.topic,
          avoidanceScore: calculateAvoidanceScore(t),
          lastAttempt: t.lastUpdatedAt,
        }));
    }
  },
];
```

---

## Migration Strategy

### Phase 1: Foundation (Week 1-2)

**Create new collections without disrupting existing system:**

```typescript
// New schema alongside existing
knowledge_graph/{userId}/
├── entities/          # New unified entity store
├── mentions/          # All mentions
├── relationships/     # Entity edges
├── threads/           # Topic threads
├── insights/          # Generated insights
└── embeddings/        # Unified vector store

// Existing collections remain functional
bogle_users/{userId}/
├── ... (all 50+ existing collections)
```

**Tasks:**
1. Create TypeScript types and interfaces
2. Implement storage layer for new collections
3. Create entity resolver service
4. Create knowledge capture service (basic)
5. Write tests for core functionality

### Phase 2: Capture Pipeline (Week 3-4)

**Wire new capture into turn processor:**

```typescript
// src/agents/processors/turn-processor.ts

// EXISTING: Data capture fires
safeFireAndForget(async () => {
  const captureResult = await processDataCapture({...});
});

// NEW: Also capture to knowledge graph
safeFireAndForget(async () => {
  await knowledgeCaptureService.captureTurn({
    userId: services.userId!,
    sessionId: services.sessionId,
    turnNumber,
    transcript: userText,
    personaId: ctx.persona?.id,
    emotion: analysisResult.analysis.emotion,
  });
}, { context: 'knowledge-graph-capture' });
```

**Tasks:**
1. Integrate LLM-based entity extraction
2. Wire capture service into turn processor
3. Implement entity resolution with disambiguation
4. Implement fact extraction
5. Build relationship extraction
6. Create thread detection/continuation logic

### Phase 3: Query Layer (Week 5-6)

**Build cross-domain query capabilities:**

**Tasks:**
1. Implement query engine
2. Create "What do we know about X?" query
3. Implement semantic search across knowledge graph
4. Build temporal query capabilities
5. Create natural language query interface

### Phase 4: Proactive Intelligence (Week 7-8)

**Add proactive surfacing:**

**Tasks:**
1. Implement proactive intelligence service
2. Build session priming from knowledge graph
3. Create turn-by-turn trigger checking
4. Implement receptivity scoring
5. Build natural phrasing generation
6. Wire into context builders

### Phase 5: Insight Generation (Week 9-10)

**Generate superhuman insights:**

**Tasks:**
1. Implement pattern detection algorithms
2. Build correlation mining
3. Create prediction generation
4. Implement growth/change detection
5. Build background job for insight generation

### Phase 6: Migration & Consolidation (Week 11-12)

**Backfill from legacy collections:**

```typescript
// Migration job
async function migrateUserToKnowledgeGraph(userId: string) {
  // 1. Extract entities from legacy collections
  const legacyContacts = await loadCollection('user_contacts', userId);
  const legacyNetwork = await loadCollection('relationship_network', userId);
  const legacyCommitments = await loadCollection('commitments', userId);
  // ... more collections
  
  // 2. Deduplicate and merge into unified entities
  const mergedEntities = await deduplicateAndMerge([
    ...extractEntitiesFrom(legacyContacts),
    ...extractEntitiesFrom(legacyNetwork),
    ...extractEntitiesFrom(legacyCommitments),
  ]);
  
  // 3. Store in knowledge graph
  for (const entity of mergedEntities) {
    await storeEntity(userId, entity);
  }
  
  // 4. Build relationships
  const relationships = await buildRelationshipsFromLegacy(userId);
  for (const rel of relationships) {
    await storeRelationship(userId, rel);
  }
  
  // 5. Generate initial insights
  await insightGenerationService.generateInsights(userId);
}
```

**Tasks:**
1. Create migration scripts for each legacy collection
2. Build deduplication logic
3. Run migration for existing users
4. Verify data integrity
5. Update existing services to query knowledge graph

---

## File Structure

```
src/memory/knowledge-graph/
├── types.ts                          # All type definitions
├── index.ts                          # Main exports
│
├── storage/
│   ├── entity-store.ts               # Entity CRUD
│   ├── mention-store.ts              # Mention CRUD
│   ├── relationship-store.ts         # Relationship CRUD
│   ├── thread-store.ts               # Thread CRUD
│   ├── insight-store.ts              # Insight CRUD
│   └── unified-vector-store.ts       # Unified embeddings
│
├── services/
│   ├── entity-resolver.ts            # Entity resolution
│   ├── knowledge-capture.ts          # Real-time capture
│   ├── query-engine.ts               # Cross-domain queries
│   ├── proactive-intelligence.ts     # Proactive surfacing
│   ├── insight-generation.ts         # Pattern/correlation detection
│   ├── temporal-reasoning.ts         # Time-based queries
│   └── natural-language.ts           # NL query interface
│
├── extractors/
│   ├── llm-entity-extractor.ts       # LLM-based entity extraction
│   ├── llm-fact-extractor.ts         # LLM-based fact extraction
│   ├── llm-relationship-extractor.ts # LLM-based relationship extraction
│   └── rule-based-extractor.ts       # Fast rule-based fallback
│
├── migration/
│   ├── legacy-adapter.ts             # Read from legacy collections
│   ├── migration-runner.ts           # Run migrations
│   └── deduplication.ts              # Entity deduplication
│
├── jobs/
│   ├── insight-generation-job.ts     # Background insight generation
│   ├── consolidation-job.ts          # Memory consolidation
│   └── decay-job.ts                  # Salience decay
│
└── __tests__/
    ├── entity-resolver.test.ts
    ├── knowledge-capture.test.ts
    ├── query-engine.test.ts
    └── integration.test.ts
```

---

## Integration Points

### 1. Turn Processor

```typescript
// src/agents/processors/turn-processor.ts

import { getKnowledgeCaptureService } from '../../memory/knowledge-graph/index.js';

// In processTurn():
const knowledgeCapture = getKnowledgeCaptureService();
await knowledgeCapture.captureTurn({
  userId,
  sessionId,
  turnNumber,
  transcript: userText,
  personaId,
  emotion,
});
```

### 2. Context Builders

```typescript
// src/intelligence/context-builders/memory/knowledge-graph-context.ts

export async function buildKnowledgeGraphContext(
  ctx: ContextBuildInput
): Promise<ContextInjection[]> {
  const queryEngine = getQueryEngine();
  const proactive = getProactiveIntelligenceService();
  
  const injections: ContextInjection[] = [];
  
  // 1. Get relevant entities from current topic
  const relevantEntities = await queryEngine.semanticSearch(
    ctx.userId,
    ctx.currentTopic,
    { limit: 5 }
  );
  
  if (relevantEntities.length > 0) {
    injections.push({
      category: 'knowledge_graph',
      content: formatEntitiesForLLM(relevantEntities),
      priority: 85,
    });
  }
  
  // 2. Get proactive triggers
  const triggers = await proactive.checkTurnTriggers(ctx.userId, {
    currentTopic: ctx.currentTopic,
    turnNumber: ctx.turnNumber,
    emotion: ctx.emotion,
  });
  
  for (const trigger of triggers) {
    if (trigger.shouldSurface) {
      injections.push({
        category: 'proactive_memory',
        content: trigger.suggestedPhrasing,
        priority: trigger.priority * 100,
      });
    }
  }
  
  return injections;
}
```

### 3. Telephony Tools

```typescript
// src/tools/domains/telephony/call-on-behalf.ts

import { getQueryEngine } from '../../../memory/knowledge-graph/index.js';

async function resolveContactQuery(userId: string, query: string) {
  const queryEngine = getQueryEngine();
  
  // Use knowledge graph instead of fragmented contact stores
  const result = await queryEngine.queryEntity(userId, {
    name: query,
    type: 'person',
    includeRelated: false,
  });
  
  if (result.entity && result.entity.contact?.phone) {
    return {
      name: result.entity.canonicalName,
      phone: result.entity.contact.phone,
      relationship: result.entity.specificRelation,
    };
  }
  
  return null;
}
```

---

## Success Metrics

### Data Quality

| Metric | Target | How to Measure |
|--------|--------|----------------|
| Entity resolution accuracy | >95% | Manual audit of ambiguous cases |
| Fact extraction accuracy | >90% | Compare LLM extraction to manual |
| Relationship accuracy | >85% | Graph traversal validation |
| Deduplication precision | >98% | No false merges |
| Deduplication recall | >90% | Find most duplicates |

### User Experience

| Metric | Target | How to Measure |
|--------|--------|----------------|
| "How did you remember that?" moments | 5+ per 100 sessions | Log user reactions |
| Proactive surfacing relevance | >70% engagement | User continues topic |
| Cross-domain query success | >90% | Query returns useful results |
| Memory correction rate | <5% | User corrects wrong memory |

### System Performance

| Metric | Target | How to Measure |
|--------|--------|----------------|
| Entity resolution latency | <50ms | p95 |
| Knowledge capture latency | <100ms | p95 (async is fine) |
| Cross-domain query latency | <200ms | p95 |
| Insight generation | <5min per user | Background job |

---

## Conclusion

This architecture transforms Ferni from a feature-fragmented system into a **unified knowledge graph** that:

1. **Stores entities as first-class citizens** - People, places, events, concepts all have canonical representations
2. **Links everything** - Every mention connects to its entity, every entity connects to related entities
3. **Enables superhuman queries** - "What do we know about X?" works across all domains
4. **Powers proactive intelligence** - The right information surfaces at the right time
5. **Grows smarter over time** - Pattern detection, correlation mining, and predictions

The migration is designed to be **non-disruptive** - we build the new system alongside the old, prove it works, then gradually shift traffic.

**This is Better Than Human memory.**

---

## Implementation Status (January 2026)

### ✅ Completed

| Component | Location | Status |
|-----------|----------|--------|
| **Types** | `src/memory/knowledge-graph/types.ts` | ✅ Complete |
| **Entity Store** | `src/memory/entity-store/` | ✅ Complete (storage, resolver, integration) |
| **LLM Entity Extraction** | `src/memory/knowledge-graph/extractors/llm-entity-extractor.ts` | ✅ Complete |
| **LLM Fact Extraction** | `src/memory/knowledge-graph/extractors/llm-fact-extractor.ts` | ✅ Complete |
| **LLM Relationship Extraction** | `src/memory/knowledge-graph/extractors/llm-relationship-extractor.ts` | ✅ Complete |
| **Knowledge Capture Service** | `src/memory/knowledge-graph/services/knowledge-capture.ts` | ✅ Complete |
| **Natural Language Query** | `src/memory/knowledge-graph/services/natural-language-query.ts` | ✅ Complete |
| **Insight Store** | `src/memory/knowledge-graph/storage/insight-store.ts` | ✅ Complete |
| **Thread Store** | `src/memory/knowledge-graph/storage/thread-store.ts` | ✅ Complete |
| **Context Builder** | `src/intelligence/context-builders/memory/knowledge-graph-context.ts` | ✅ Complete |
| **Turn Processor Integration** | `src/agents/processors/turn-processor.ts` | ✅ Wired in |
| **Background Jobs** | `src/tasks/scheduled/knowledge-graph-jobs.ts` | ✅ Complete |
| **E2E Tests** | `src/memory/knowledge-graph/__tests__/knowledge-graph-e2e.test.ts` | ✅ Complete |
| **Proactive Surfacing** | `src/memory/knowledge-graph/proactive-surfacing.ts` | ✅ Complete |
| **Consolidation** | `src/memory/knowledge-graph/consolidation.ts` | ✅ Complete |
| **Correlation Engine** | `src/memory/entity-store/correlation-engine.ts` | ✅ Complete |

### Key Files

```
src/memory/knowledge-graph/
├── index.ts                           # Main exports
├── types.ts                           # Type definitions
├── CLAUDE.md                          # Module documentation
│
├── extractors/
│   ├── llm-entity-extractor.ts        # LLM + rule-based entity extraction
│   ├── llm-fact-extractor.ts          # LLM + rule-based fact extraction
│   └── llm-relationship-extractor.ts  # LLM + rule-based relationship extraction
│
├── services/
│   ├── knowledge-capture.ts           # Real-time capture from turns
│   └── natural-language-query.ts      # NL query interface
│
├── storage/
│   ├── insight-store.ts               # Insight persistence
│   └── thread-store.ts                # Thread persistence
│
└── __tests__/
    └── knowledge-graph-e2e.test.ts    # Comprehensive E2E tests

src/intelligence/context-builders/memory/
└── knowledge-graph-context.ts         # Injects entities into LLM context

src/tasks/scheduled/
└── knowledge-graph-jobs.ts            # Background maintenance jobs
```

### Query Types Supported

| Query | Example | Status |
|-------|---------|--------|
| Entity Profile | "What do we know about Mike?" | ✅ |
| Temporal | "When did I last talk about mom?" | ✅ |
| Pattern | "What patterns have you noticed?" | ✅ |
| Relationship | "How is Mike connected to Sarah?" | ✅ |
| Open Loops | "What didn't we finish discussing?" | ✅ |
| Insights | "What insights do you have?" | ✅ |
| Timeline | "Show me the timeline for X" | ✅ |

### Integration Points

1. **Turn Processor**: Knowledge capture fires on every user turn (non-blocking)
2. **Context Builders**: `knowledge-graph` builder registered in loader
3. **Background Jobs**: 4 jobs registered for daily maintenance
4. **Entity Store**: Full integration with existing entity-store module

---

*Architecture version: 2.1*
*Last updated: January 2026*
*Implementation completed: January 6, 2026*
