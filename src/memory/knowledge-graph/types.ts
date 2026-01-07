/**
 * Knowledge Graph Types - Better Than Human Memory
 *
 * This is the foundation of Ferni's superhuman memory system.
 * Unlike the fragmented domain-specific stores, this creates a
 * unified entity-centric model where everything connects.
 *
 * Philosophy:
 * - Human memory is entity-centric, not feature-centric
 * - "Tell me about Sarah" should return EVERYTHING about Sarah
 * - Cross-domain patterns emerge from connections, not separate stores
 * - Temporal context is first-class: when things happened matters
 * - Emotional salience affects memory strength
 *
 * @module memory/knowledge-graph/types
 */

// ============================================================================
// ENTITY TYPES
// ============================================================================

/**
 * Core entity types in the knowledge graph
 */
export type EntityType =
  | 'person' // People mentioned: family, friends, colleagues
  | 'place' // Locations: home, work, cities, countries
  | 'organization' // Companies, schools, groups
  | 'event' // Events: meetings, birthdays, trips
  | 'topic' // Abstract topics: career, health, relationships
  | 'goal' // User's goals and aspirations
  | 'habit' // Habits the user has or wants
  | 'commitment' // Promises, intentions, plans
  | 'emotion' // Emotional states experienced
  | 'value' // User's values and beliefs
  | 'dream' // Long-term dreams and aspirations
  | 'memory' // A specific memory/moment
  | 'self'; // The user themselves

/**
 * A node in the knowledge graph.
 * Everything is an entity - people, places, concepts, memories.
 */
export interface Entity {
  /** Unique identifier */
  id: string;

  /** User who owns this entity */
  userId: string;

  /** Type of entity */
  type: EntityType;

  /** Canonical name (for display and matching) */
  canonicalName: string;

  /** Alternative names/aliases for this entity */
  aliases: string[];

  /** When this entity was first mentioned */
  firstMentioned: Date;

  /** When this entity was last mentioned */
  lastMentioned: Date;

  /** Total number of times this entity has been mentioned */
  mentionCount: number;

  /** Emotional salience score (0-1) - how emotionally significant */
  emotionalSalience: number;

  /** Importance score (0-1) - computed from connections and mentions */
  importance: number;

  /** Domain-specific properties (structured data) */
  properties: EntityProperties;

  /** Embedding vector for semantic search */
  embedding?: number[];

  /** Metadata */
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Properties specific to entity types.
 * This provides structured data for each entity type.
 */
export interface EntityProperties {
  // Person properties
  relationship?: string; // "mother", "friend", "colleague"
  phone?: string;
  email?: string;
  birthday?: string;
  location?: string;
  occupation?: string;

  // Place properties
  address?: string;
  coordinates?: { lat: number; lng: number };
  placeType?: string; // "home", "work", "restaurant"

  // Event properties
  date?: Date;
  endDate?: Date;
  recurring?: boolean;
  recurrencePattern?: string;
  participants?: string[]; // Entity IDs

  // Goal/Dream properties
  status?: 'active' | 'achieved' | 'abandoned' | 'paused';
  targetDate?: Date;
  progress?: number; // 0-100

  // Habit properties
  frequency?: string;
  streak?: number;
  lastCompleted?: Date;

  // Commitment properties
  dueDate?: Date;
  priority?: 'high' | 'medium' | 'low';
  completed?: boolean;

  // Value properties
  strength?: number; // How strongly held (0-1)
  category?: string;

  // Generic
  notes?: string;
  tags?: string[];
}

// ============================================================================
// RELATIONSHIP TYPES
// ============================================================================

/**
 * Types of relationships between entities.
 * These form the edges of the knowledge graph.
 */
export type RelationshipType =
  // Person relationships
  | 'family_of' // Family relationship
  | 'friend_of' // Friendship
  | 'colleague_of' // Work relationship
  | 'romantic_partner' // Romantic relationship
  | 'knows' // General acquaintance

  // Spatial relationships
  | 'located_at' // Entity is at a place
  | 'lives_at' // Person lives somewhere
  | 'works_at' // Person works somewhere
  | 'happened_at' // Event happened at place

  // Temporal relationships
  | 'before' // Temporal ordering
  | 'after' // Temporal ordering
  | 'during' // Temporal overlap
  | 'caused_by' // Causal relationship
  | 'led_to' // Consequence

  // Topical relationships
  | 'about' // Entity is about a topic
  | 'related_to' // General relation
  | 'part_of' // Hierarchical
  | 'instance_of' // Type relationship

  // Emotional relationships
  | 'feels_about' // User's feeling toward entity
  | 'associated_with' // Emotional association

  // Goal relationships
  | 'supports' // Supports achieving goal
  | 'blocks' // Blocks achieving goal
  | 'requires' // Dependency

  // Memory relationships
  | 'mentioned_in' // Entity mentioned in memory
  | 'involves' // Entity involved in event
  | 'reminded_of'; // One entity reminds of another

/**
 * An edge in the knowledge graph connecting two entities.
 */
export interface Relationship {
  /** Unique identifier */
  id: string;

  /** User who owns this relationship */
  userId: string;

  /** Source entity ID */
  sourceId: string;

  /** Target entity ID */
  targetId: string;

  /** Type of relationship */
  type: RelationshipType;

  /** Relationship strength (0-1) */
  strength: number;

  /** Direction: is this bidirectional? */
  bidirectional: boolean;

  /** Specific label for this relationship instance */
  label?: string; // e.g., "mother" for family_of

  /** When this relationship was first established */
  firstEstablished: Date;

  /** When this relationship was last reinforced */
  lastReinforced: Date;

  /** Number of times this relationship has been mentioned */
  reinforcementCount: number;

  /** Emotional valence of this relationship (-1 to 1) */
  emotionalValence: number;

  /** Metadata */
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// FACT TYPES
// ============================================================================

/**
 * A fact is a piece of information about an entity.
 * Facts have provenance (where they came from) and confidence.
 */
export interface Fact {
  /** Unique identifier */
  id: string;

  /** User who owns this fact */
  userId: string;

  /** Entity this fact is about */
  entityId: string;

  /** The fact content in natural language */
  content: string;

  /** Structured representation (if applicable) */
  structured?: {
    predicate: string; // e.g., "phone_number", "birthday", "occupation"
    value: string | number | boolean | Date;
  };

  /** Confidence score (0-1) - how sure are we? */
  confidence: number;

  /** Source of this fact */
  source: FactSource;

  /** When this fact was learned */
  learnedAt: Date;

  /** When this fact was last confirmed */
  lastConfirmed: Date;

  /** Number of times this fact has been confirmed */
  confirmationCount: number;

  /** Has this fact been contradicted? */
  contradicted: boolean;

  /** If contradicted, what's the new fact ID? */
  supersededBy?: string;

  /** Metadata */
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Where a fact came from
 */
export interface FactSource {
  /** Type of source */
  type: 'conversation' | 'correction' | 'inference' | 'integration' | 'import';

  /** Session ID where this was learned (if conversation) */
  sessionId?: string;

  /** Turn number where this was learned */
  turnNumber?: number;

  /** The original text that yielded this fact */
  sourceText?: string;

  /** If inferred, what facts led to this inference? */
  inferredFrom?: string[];

  /** External integration source (calendar, contacts, etc.) */
  integration?: string;
}

// ============================================================================
// TEMPORAL TYPES
// ============================================================================

/**
 * A temporal mention of an entity.
 * This tracks when entities were mentioned and the emotional context.
 */
export interface TemporalMention {
  /** Unique identifier */
  id: string;

  /** User ID */
  userId: string;

  /** Entity that was mentioned */
  entityId: string;

  /** When the mention occurred */
  timestamp: Date;

  /** Session ID */
  sessionId: string;

  /** Turn number in conversation */
  turnNumber: number;

  /** The context/transcript snippet */
  context: string;

  /** Emotional state during this mention */
  emotionalContext: {
    primary: string; // Primary emotion
    intensity: number; // 0-1
    valence: number; // -1 to 1
  };

  /** What triggered this mention */
  trigger?: 'user_initiated' | 'ferni_surfaced' | 'follow_up' | 'association';

  /** If Ferni surfaced this, was it helpful? */
  surfacingFeedback?: 'helpful' | 'neutral' | 'unhelpful';
}

// ============================================================================
// CORRELATION TYPES
// ============================================================================

/**
 * A detected correlation between entities or patterns.
 * This enables "Better Than Human" pattern recognition.
 */
export interface Correlation {
  /** Unique identifier */
  id: string;

  /** User ID */
  userId: string;

  /** Type of correlation */
  type: CorrelationType;

  /** Entities involved */
  entityIds: string[];

  /** Description of the correlation */
  description: string;

  /** Statistical strength (0-1) */
  strength: number;

  /** Number of observations supporting this */
  observationCount: number;

  /** Confidence in this correlation */
  confidence: number;

  /** Is this a causal relationship or just correlation? */
  causal: boolean;

  /** Pattern details */
  pattern?: {
    temporal?: string; // e.g., "Sunday evenings"
    contextual?: string; // e.g., "after work stress"
    behavioral?: string; // e.g., "before important meetings"
  };

  /** When this correlation was first detected */
  firstDetected: Date;

  /** When this correlation was last observed */
  lastObserved: Date;

  /** Metadata */
  createdAt: Date;
  updatedAt: Date;
}

export type CorrelationType =
  | 'temporal' // Things that happen around same time
  | 'emotional' // Emotional patterns
  | 'behavioral' // Behavioral patterns
  | 'topical' // Topic co-occurrence
  | 'social' // Social patterns (who with whom)
  | 'causal' // One thing causes another
  | 'cyclical'; // Recurring patterns

// ============================================================================
// QUERY TYPES
// ============================================================================

/**
 * Query for retrieving entities and their context
 */
export interface EntityQuery {
  /** User ID */
  userId: string;

  /** Text to search for */
  query?: string;

  /** Entity types to include */
  types?: EntityType[];

  /** Minimum importance score */
  minImportance?: number;

  /** Minimum emotional salience */
  minSalience?: number;

  /** Time range for mentions */
  timeRange?: {
    start: Date;
    end: Date;
  };

  /** Include related entities up to this depth */
  relationshipDepth?: number;

  /** Maximum results */
  limit?: number;

  /** Include facts about entities? */
  includeFacts?: boolean;

  /** Include recent mentions? */
  includeRecentMentions?: number; // Number of recent mentions to include
}

/**
 * Result of an entity query
 */
export interface EntityQueryResult {
  /** The entity */
  entity: Entity;

  /** Relevance score for this result */
  relevance: number;

  /** Related entities (if depth > 0) */
  related?: {
    entity: Entity;
    relationship: Relationship;
    depth: number;
  }[];

  /** Facts about this entity (if requested) */
  facts?: Fact[];

  /** Recent mentions (if requested) */
  recentMentions?: TemporalMention[];

  /** Known correlations involving this entity */
  correlations?: Correlation[];
}

/**
 * "Tell me everything about X" query result
 */
export interface EntityProfile {
  /** The primary entity */
  entity: Entity;

  /** All known facts */
  facts: Fact[];

  /** All relationships */
  relationships: {
    relationship: Relationship;
    relatedEntity: Entity;
  }[];

  /** Temporal history */
  timeline: TemporalMention[];

  /** Detected patterns/correlations */
  patterns: Correlation[];

  /** Emotional history with this entity */
  emotionalHistory: {
    averageValence: number;
    emotionDistribution: Record<string, number>;
    trend: 'improving' | 'stable' | 'declining';
  };

  /** Recommended follow-ups or things to remember */
  recommendations: {
    type: 'follow_up' | 'remember' | 'check_in' | 'celebrate';
    content: string;
    urgency: 'high' | 'medium' | 'low';
  }[];
}

// ============================================================================
// MEMORY CONSOLIDATION TYPES
// ============================================================================

/**
 * Result of memory consolidation
 */
export interface ConsolidationResult {
  /** Entities merged */
  entitiesMerged: number;

  /** Facts consolidated */
  factsConsolidated: number;

  /** Relationships strengthened */
  relationshipsStrengthened: number;

  /** Weak memories decayed */
  memoriesDecayed: number;

  /** New correlations detected */
  newCorrelations: Correlation[];
}

/**
 * Memory decay configuration
 */
export interface DecayConfig {
  /** Base decay rate per day (0-1) */
  baseDecayRate: number;

  /** Minimum strength before entity is archived */
  minimumStrength: number;

  /** Emotional salience protection factor */
  emotionalProtection: number;

  /** Recent mention protection (days) */
  recentMentionProtectionDays: number;

  /** High-importance entity protection factor */
  importanceProtection: number;
}

// ============================================================================
// PROACTIVE SURFACING TYPES
// ============================================================================

/**
 * A recommendation for proactive memory surfacing
 */
export interface SurfacingRecommendation {
  /** Entity to surface */
  entity: Entity;

  /** Why this should be surfaced */
  reason: SurfacingReason;

  /** Urgency (higher = surface sooner) */
  urgency: number;

  /** Suggested phrasing for natural mention */
  suggestedPhrase: string;

  /** Context that makes this relevant now */
  contextTrigger?: string;

  /** Score for ranking recommendations */
  score: number;
}

export type SurfacingReason =
  | 'time_based' // Anniversary, birthday, recurring event
  | 'context_relevant' // Related to current conversation
  | 'follow_up' // Previous conversation callback
  | 'pattern_match' // Similar situation detected
  | 'emotional_support' // User might need support
  | 'goal_related' // Related to user's goals
  | 'commitment_due' // Commitment coming due
  | 'connection_dormant' // Haven't mentioned in a while
  | 'celebration'; // Something to celebrate
