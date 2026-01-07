/**
 * Unified Entity Store Types
 *
 * The atomic units of superhuman memory.
 * Every piece of user data becomes an Entity with semantic embeddings
 * and graph relationships.
 *
 * @module memory/entity-store/types
 */

// ============================================================================
// ENTITY TYPES
// ============================================================================

/**
 * All possible entity types
 */
export type EntityType =
  | 'person' // People in user's life
  | 'place' // Locations that matter
  | 'event' // Past or future events
  | 'commitment' // Promises, intentions, decisions
  | 'value' // Core values
  | 'dream' // Long-term aspirations
  | 'pattern' // Behavioral patterns
  | 'preference' // Likes, dislikes, preferences
  | 'memory' // Specific remembered moments
  | 'topic' // Recurring conversation topics
  | 'emotion' // Emotional states/patterns
  | 'goal'; // Active goals

/**
 * How was this entity created?
 */
export type EntitySource =
  | 'conversation' // Extracted from conversation
  | 'explicit' // User explicitly created
  | 'calendar' // From calendar integration
  | 'contacts' // From contacts import
  | 'migration' // Migrated from legacy collection
  | 'inferred'; // Inferred from context

/**
 * Relationship type for people (family, friend, colleague, etc.)
 * Used by entity-resolver for person-to-user relationships.
 */
export type RelationshipType =
  | 'family'
  | 'friend'
  | 'colleague'
  | 'romantic'
  | 'professional'
  | 'acquaintance'
  | 'other';

/** @deprecated Use RelationshipType instead */
export type SimpleRelationshipType = RelationshipType;

/**
 * Specific family relationships
 */
export type FamilyRelation =
  | 'mother'
  | 'father'
  | 'brother'
  | 'sister'
  | 'son'
  | 'daughter'
  | 'wife'
  | 'husband'
  | 'partner'
  | 'grandmother'
  | 'grandfather'
  | 'aunt'
  | 'uncle'
  | 'cousin'
  | 'niece'
  | 'nephew';

/**
 * Input for capturing a person entity
 */
export interface PersonCaptureInput {
  name?: string;
  relationship?: string; // "brother", "boss", etc.
  phone?: string;
  email?: string;
  context?: string; // Additional context from conversation
}

/**
 * Context for data capture
 */
export interface CaptureContext {
  conversationId: string;
  sessionId: string;
  personaId: string;
  transcript: string;
  emotion?: {
    primary: string;
    intensity: number;
  };
}

/**
 * Result of entity capture
 */
export interface CaptureResult {
  entity: Entity;
  isNew: boolean;
  merged: boolean;
  confidence: number;
}

/**
 * Unified Entity - the atomic unit of memory
 *
 * Store once, link everywhere. Every piece of user data
 * becomes an entity with semantic embeddings and graph relationships.
 */
export interface Entity {
  // ═══════════════════════════════════════════════════════════════════════════
  // IDENTITY
  // ═══════════════════════════════════════════════════════════════════════════

  /** Unique identifier (UUID) */
  id: string;

  /** Owner user ID */
  userId: string;

  /** Entity type */
  type: EntityType;

  // ═══════════════════════════════════════════════════════════════════════════
  // NAMES & ALIASES
  // ═══════════════════════════════════════════════════════════════════════════

  /** Primary display name */
  canonicalName: string;

  /** Alternative names/references ("mom", "mother", "my mom", "Sarah") */
  aliases: string[];

  /** Tokenized names for BM25 keyword search */
  searchTokens: string[];

  // ═══════════════════════════════════════════════════════════════════════════
  // SEMANTIC SEARCH
  // ═══════════════════════════════════════════════════════════════════════════

  /** Primary embedding (1536 dims for text-embedding-3-small) */
  embedding: number[];

  /**
   * Context-aware embeddings for better retrieval
   * Different embeddings based on how entity is referenced
   */
  contextualEmbeddings?: {
    /** Embedding when entity is subject ("Mike went to...") */
    asSubject?: number[];
    /** Embedding when entity is object ("...called Mike") */
    asObject?: number[];
    /** Embedding in emotional context ("worried about Mike") */
    inEmotion?: number[];
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // TEMPORAL
  // ═══════════════════════════════════════════════════════════════════════════

  /** When first mentioned */
  firstSeen: Date;

  /** Most recent mention */
  lastSeen: Date;

  /** How often mentioned */
  mentionCount: number;

  /** Extended temporal context */
  temporalContext: TemporalContext;

  // ═══════════════════════════════════════════════════════════════════════════
  // SALIENCE
  // ═══════════════════════════════════════════════════════════════════════════

  /** Overall importance (0-1) */
  salienceScore: number;

  /** Emotional significance (0-1) */
  emotionalWeight: number;

  /** Computed recency boost */
  recencyBoost: number;

  // ═══════════════════════════════════════════════════════════════════════════
  // TYPE-SPECIFIC ATTRIBUTES
  // ═══════════════════════════════════════════════════════════════════════════

  /** Type-dependent fields (polymorphic) */
  attributes: EntityAttributes;

  // ═══════════════════════════════════════════════════════════════════════════
  // PROVENANCE
  // ═══════════════════════════════════════════════════════════════════════════

  /** Which conversations mentioned this */
  sourceConversations: string[];

  /** Which personas learned this */
  sourcePersonas: string[];

  /** How confident we are in this entity (0-1) */
  confidence: number;

  /** When this entity was created */
  createdAt: Date;

  /** When this entity was last updated */
  updatedAt: Date;

  // ═══════════════════════════════════════════════════════════════════════════
  // BACKWARD COMPATIBILITY FIELDS (for entity-resolver, migration)
  // ═══════════════════════════════════════════════════════════════════════════

  /** Contact information for person entities */
  contact?: ContactInfo;

  /** Relationship category for person entities */
  relationship?: RelationshipType;

  /** Specific relationship (brother, mother, boss, etc.) */
  specificRelation?: string;

  /** Associated topics */
  topics?: string[];

  /** Alias for salienceScore (backward compat) */
  salience?: number;

  /** How was this entity created */
  source?: EntitySource;

  /** If consolidated from multiple entities */
  mergedFrom?: string[];

  /** Legacy IDs for migration linking */
  legacyIds?: {
    userContactId?: string;
    relationshipNetworkId?: string;
    contactRelationshipId?: string;
    guestProfileId?: string;
  };

  /** First mention timestamp (alias for firstSeen) */
  firstMentionedAt?: Date;

  /** Last mention timestamp (alias for lastSeen) */
  lastMentionedAt?: Date;
}

/**
 * Contact information for person entities
 */
export interface ContactInfo {
  phone?: string;
  email?: string;
  address?: string;
  birthday?: string; // ISO date string
  notes?: string;
}

/**
 * Extended temporal context for memory decay and surfacing
 */
export interface TemporalContext {
  /** Emotionally significant mention timestamps */
  peakMoments: Date[];

  /** Most recent emotional peak */
  lastEmotionalPeak?: Date;

  /** How fast salience decays (higher = slower decay) */
  emotionalDecayResistance: number;

  /** Specific dates associated with this entity (birthdays, anniversaries) */
  significantDates?: Array<{
    date: Date;
    type: 'birthday' | 'anniversary' | 'loss' | 'milestone' | 'recurring';
    description?: string;
  }>;
}

// ============================================================================
// TYPE-SPECIFIC ATTRIBUTES
// ============================================================================

/**
 * Union of all type-specific attributes
 */
export type EntityAttributes =
  | PersonAttributes
  | PlaceAttributes
  | EventAttributes
  | CommitmentAttributes
  | ValueAttributes
  | DreamAttributes
  | PatternAttributes
  | PreferenceAttributes
  | MemoryAttributes
  | TopicAttributes
  | EmotionAttributes
  | GoalAttributes;

/**
 * Person entity attributes
 */
export interface PersonAttributes {
  _type: 'person';

  /** Relationship to user ("brother", "boss", "friend") */
  relationship: string;

  /** Relationship category */
  relationshipCategory:
    | 'family'
    | 'friend'
    | 'colleague'
    | 'acquaintance'
    | 'professional'
    | 'other';

  /** Contact information */
  phone?: string;
  email?: string;

  /** Birthday (month/day, optionally year) */
  birthday?: {
    month: number;
    day: number;
    year?: number;
  };

  /** What comforts them */
  comfortPatterns?: string[];

  /** What stresses them */
  stressTriggers?: string[];

  /** Recent things mentioned about them */
  recentContext?: string[];

  /** User's feelings toward them (-1 to 1) */
  sentiment: number;

  /** Last known status ("doing well", "struggling with work") */
  lastKnownStatus?: string;
}

/**
 * Place entity attributes
 */
export interface PlaceAttributes {
  _type: 'place';

  /** Type of place */
  placeType: 'home' | 'work' | 'travel' | 'restaurant' | 'other';

  /** Location string */
  location?: string;

  /** Coordinates if known */
  coordinates?: {
    lat: number;
    lng: number;
  };

  /** Emotional associations */
  emotionalAssociations?: string[];
}

/**
 * Event entity attributes
 */
export interface EventAttributes {
  _type: 'event';

  /** Event type */
  eventType:
    | 'birthday'
    | 'anniversary'
    | 'appointment'
    | 'milestone'
    | 'loss'
    | 'celebration'
    | 'trip'
    | 'meeting'
    | 'other';

  /** Event date (past or future) */
  date?: Date;

  /** Is this recurring? */
  isRecurring: boolean;

  /** Recurring pattern ("yearly", "monthly", "weekly") */
  recurringPattern?: string;

  /** Entity IDs of related people */
  relatedPeople: string[];

  /** Emotional significance */
  emotionalSignificance: 'routine' | 'meaningful' | 'major' | 'life_changing';

  /** Event status */
  status: 'planned' | 'upcoming' | 'happened' | 'cancelled';
}

/**
 * Commitment entity attributes
 */
export interface CommitmentAttributes {
  _type: 'commitment';

  /** Commitment type */
  commitmentType: 'promise' | 'intention' | 'decision' | 'goal';

  /** Current status */
  status: 'active' | 'completed' | 'abandoned' | 'deferred';

  /** Target date if any */
  targetDate?: Date;

  /** Entity IDs of related people */
  relatedPeople: string[];

  /** Who is accountable */
  accountability: 'self' | 'shared' | 'to_other';

  /** Original statement (what they actually said) */
  originalStatement: string;

  /** Progress notes */
  progressNotes?: string[];

  /** Last check-in date */
  lastCheckIn?: Date;
}

/**
 * Value entity attributes
 */
export interface ValueAttributes {
  _type: 'value';

  /** Value category */
  valueCategory:
    | 'family'
    | 'career'
    | 'health'
    | 'relationships'
    | 'growth'
    | 'creativity'
    | 'security'
    | 'freedom'
    | 'other';

  /** How strongly held */
  strength: 'mentioned' | 'evident' | 'core_identity';

  /** Times this value was demonstrated */
  demonstrations?: string[];

  /** Any conflicts with other values */
  conflictsWith?: string[];
}

/**
 * Dream entity attributes
 */
export interface DreamAttributes {
  _type: 'dream';

  /** Dream category */
  dreamCategory: 'career' | 'family' | 'creative' | 'travel' | 'lifestyle' | 'learning' | 'other';

  /** Current status */
  status: 'active_pursuit' | 'someday' | 'back_burner' | 'achieved' | 'abandoned';

  /** Why this dream matters */
  underlyingMotivation?: string;

  /** Obstacles mentioned */
  obstacles?: string[];

  /** Progress markers */
  progressMarkers?: string[];
}

/**
 * Pattern entity attributes
 */
export interface PatternAttributes {
  _type: 'pattern';

  /** Pattern type */
  patternType:
    | 'behavioral'
    | 'emotional'
    | 'temporal'
    | 'relational'
    | 'energy'
    | 'communication'
    | 'avoidance';

  /** Pattern description */
  description: string;

  /** Evidence supporting this pattern */
  evidence: string[];

  /** How confident we are */
  patternConfidence: number;

  /** Whether user is aware of this pattern */
  userAware: boolean;

  /** Whether to surface this pattern */
  shouldSurface: boolean;
}

/**
 * Preference entity attributes
 */
export interface PreferenceAttributes {
  _type: 'preference';

  /** Preference category */
  preferenceCategory:
    | 'communication'
    | 'topics'
    | 'style'
    | 'timing'
    | 'boundaries'
    | 'humor'
    | 'other';

  /** The specific preference */
  preference: string;

  /** Whether this is explicit or inferred */
  source: 'explicit' | 'inferred';

  /** Confidence if inferred */
  inferenceConfidence?: number;
}

/**
 * Memory entity attributes (specific recalled moments)
 */
export interface MemoryAttributes {
  _type: 'memory';

  /** Memory type */
  memoryType:
    | 'breakthrough'
    | 'vulnerability'
    | 'celebration'
    | 'milestone'
    | 'story'
    | 'insight'
    | 'challenge';

  /** The memory content */
  content: string;

  /** When this happened */
  occurredAt?: Date;

  /** Emotional weight at time of mention */
  emotionalIntensity: number;

  /** Entity IDs of people mentioned */
  peopleMentioned: string[];

  /** Topics covered */
  topics: string[];
}

/**
 * Topic entity attributes
 */
export interface TopicAttributes {
  _type: 'topic';

  /** Topic category */
  topicCategory: 'work' | 'health' | 'relationships' | 'hobbies' | 'goals' | 'concerns' | 'other';

  /** User's general sentiment about this topic */
  sentiment: 'positive' | 'negative' | 'neutral' | 'mixed';

  /** How often discussed */
  frequency: 'every_session' | 'often' | 'occasionally' | 'rarely';

  /** Related subtopics */
  relatedTopics?: string[];
}

/**
 * Emotion entity attributes
 */
export interface EmotionAttributes {
  _type: 'emotion';

  /** Emotion type */
  emotionType:
    | 'anxiety'
    | 'joy'
    | 'sadness'
    | 'anger'
    | 'fear'
    | 'excitement'
    | 'gratitude'
    | 'other';

  /** Trigger if known */
  trigger?: string;

  /** Context when this emotion appears */
  typicalContext?: string[];

  /** What helps */
  helpfulResponses?: string[];
}

/**
 * Goal entity attributes
 */
export interface GoalAttributes {
  _type: 'goal';

  /** Goal category */
  goalCategory:
    | 'career'
    | 'health'
    | 'financial'
    | 'relationship'
    | 'learning'
    | 'creative'
    | 'other';

  /** Current status */
  status: 'planning' | 'active' | 'stalled' | 'achieved' | 'abandoned';

  /** Target date */
  targetDate?: Date;

  /** Progress percentage (0-100) */
  progress: number;

  /** Milestones */
  milestones?: Array<{
    description: string;
    completed: boolean;
    completedAt?: Date;
  }>;

  /** Blockers */
  blockers?: string[];
}

// ============================================================================
// GRAPH EDGE TYPES
// ============================================================================

/**
 * Edge types for entity relationships in the knowledge graph.
 * These describe HOW entities are connected (not to be confused with
 * RelationshipType which describes person-to-user relationships).
 */
export type EdgeType =
  | 'involves' // Event involves Person
  | 'about' // Commitment is about Topic
  | 'affects' // Pattern affects Person
  | 'related_to' // General association
  | 'causes' // X causes Y (causal chain)
  | 'conflicts_with' // Value conflicts with Commitment
  | 'supports' // Dream supports Value
  | 'mentions' // Memory mentions Person
  | 'preceded_by' // Event preceded by Event (temporal)
  | 'followed_by' // Event followed by Event (temporal)
  | 'belongs_to' // Person belongs to group/family
  | 'located_at' // Event/Person at Place
  | 'triggers' // Emotion triggered by Event/Topic
  | 'blocks' // Blocker blocks Goal
  | 'helps' // Resource helps Goal
  // Person-to-person edge types (used in EntityRelationship)
  | 'knows' // Generic connection
  | 'family_of' // Family relationship
  | 'friend_of' // Friendship
  | 'works_with' // Professional
  | 'reports_to' // Hierarchy
  | 'romantic_with'; // Romantic

/**
 * Relationship between entities in the knowledge graph
 */
export interface EntityRelationship {
  /** Unique identifier */
  id: string;

  /** Source entity ID */
  fromEntity: string;

  /** Target entity ID */
  toEntity: string;

  /** Edge type describing the relationship */
  type: EdgeType;

  /** Relationship strength (0-1) */
  strength: number;

  /** When first linked */
  firstLinked: Date;

  /** When last reinforced */
  lastReinforced: Date;

  /** How many times this link has been reinforced */
  reinforcementCount: number;

  /** Why they're related (context) */
  context?: string;

  /** Is this bidirectional? */
  bidirectional: boolean;
}

// ============================================================================
// MENTION TRACKING
// ============================================================================

/**
 * Track every mention of an entity across conversations
 */
export interface EntityMention {
  /** Unique identifier */
  id: string;

  /** Entity that was mentioned */
  entityId: string;

  /** User ID */
  userId: string;

  /** Conversation ID */
  conversationId: string;

  /** Session ID */
  sessionId: string;

  /** Persona that was active */
  personaId: string;

  /** When mentioned */
  timestamp: Date;

  /** Text snippet containing the mention */
  snippet: string;

  /** Emotional weight at time of mention */
  emotionalWeight: number;

  /** Context of the mention */
  mentionContext: 'direct' | 'indirect' | 'question' | 'response';
}

// ============================================================================
// SEARCH & RETRIEVAL
// ============================================================================

/**
 * Search options for entity retrieval
 */
export interface EntitySearchOptions {
  /** User ID (required for scoping) */
  userId?: string;

  /** Maximum results */
  topK?: number;

  /** Maximum results (alias for topK) */
  limit?: number;

  /** Minimum similarity score */
  minScore?: number;

  /** Minimum salience threshold */
  minSalience?: number;

  /** Filter by entity types */
  types?: EntityType[];

  /** Filter by relationship types (for person entities) */
  relationships?: RelationshipType[];

  /** Include graph expansion */
  expandGraph?: boolean;

  /** Max hops for graph expansion */
  maxGraphHops?: number;

  /** Use hybrid search (BM25 + vector) */
  hybrid?: boolean;

  /** Apply cross-encoder reranking */
  rerank?: boolean;

  /** Include archived entities */
  includeArchived?: boolean;
}

/**
 * Search result with scoring breakdown
 */
export interface EntitySearchResult {
  /** The entity */
  entity: Entity;

  /** Overall relevance score */
  score: number;

  /** Score breakdown for explainability */
  scoreBreakdown: {
    semantic: number;
    keyword: number;
    temporal: number;
    emotional: number;
    graphDistance: number;
  };

  /** Natural language explanation */
  reason: string;

  /** Graph path if from expansion */
  graphPath?: string[];
}

// ============================================================================
// SURFACING
// ============================================================================

/**
 * Proactive surfacing opportunity
 */
export interface SurfacingOpportunity {
  /** Type of surfacing opportunity */
  type:
    | 'entity_context' // User mentioned something we know about
    | 'temporal' // Time-relevant
    | 'pattern_insight' // Pattern detected
    | 'commitment_checkin' // Check in on commitment
    | 'causal_awareness'; // This topic led somewhere before

  /** Related entity */
  entity: Entity;

  /** When to surface */
  timing: 'immediate' | 'soon' | 'when_relevant' | 'if_continues';

  /** Natural phrasing suggestion */
  naturalPhrasing: string;

  /** User receptivity score (0-1) */
  receptivityScore?: number;

  /** Related info to surface */
  relatedInfo?: Entity[];
}

// ============================================================================
// CONSOLIDATION
// ============================================================================

/**
 * Memory consolidation report
 */
export interface ConsolidationReport {
  /** Entities merged due to similarity */
  mergedEntities: number;

  /** Entities decayed due to age/irrelevance */
  decayedEntities: number;

  /** Entities strengthened due to frequency */
  strengthenedEntities: number;

  /** New patterns detected */
  newPatternsDetected: number;

  /** Relationships created/strengthened */
  relationshipsUpdated: number;

  /** Time taken */
  durationMs: number;
}

// ============================================================================
// FACTORY HELPERS
// ============================================================================

/**
 * Create a new entity with defaults
 */
export function createEntity(
  userId: string,
  type: EntityType,
  name: string,
  attributes: EntityAttributes
): Omit<Entity, 'id' | 'embedding'> {
  const now = new Date();
  return {
    userId,
    type,
    canonicalName: name,
    aliases: [],
    searchTokens: tokenize(name),
    firstSeen: now,
    lastSeen: now,
    mentionCount: 1,
    temporalContext: {
      peakMoments: [],
      emotionalDecayResistance: 1.0,
    },
    salienceScore: 0.5,
    emotionalWeight: 0,
    recencyBoost: 1.0,
    attributes,
    sourceConversations: [],
    sourcePersonas: [],
    confidence: 0.8,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Tokenize text for BM25 search
 */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 1);
}

/**
 * Convert entity to text for embedding
 */
export function entityToText(entity: Entity): string {
  const parts = [entity.canonicalName];

  if (entity.aliases.length > 0) {
    parts.push(`(also known as: ${entity.aliases.join(', ')})`);
  }

  // Add type-specific context
  const attrs = entity.attributes;
  switch (attrs._type) {
    case 'person':
      parts.push(`${attrs.relationship}`);
      if (attrs.lastKnownStatus) parts.push(attrs.lastKnownStatus);
      break;
    case 'commitment':
      parts.push(`${attrs.commitmentType}: ${attrs.originalStatement}`);
      break;
    case 'event':
      parts.push(`${attrs.eventType} event`);
      break;
    case 'memory':
      parts.push(attrs.content);
      break;
    // Add more as needed
  }

  return parts.join(' - ');
}
