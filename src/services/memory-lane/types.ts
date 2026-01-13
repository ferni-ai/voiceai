/**
 * Memory Lane - Types
 *
 * Types for the Memory Lane feature that surfaces meaningful moments from
 * past conversations, creating a sense of shared history between the user
 * and Ferni.
 *
 * Memory Lane provides:
 * - "On This Day" anniversary moments
 * - Growth and progress highlights
 * - Relationship depth markers
 * - Emotional breakthrough moments
 *
 * @module services/memory-lane/types
 */

// ============================================================================
// CORE MEMORY TYPES
// ============================================================================

/**
 * The types of memorable moments we capture
 */
export type MemoryType =
  | 'milestone' // Major life events, achievements
  | 'growth' // Personal progress moments
  | 'connection' // Deep relationship moments with Ferni
  | 'commitment' // Promises made and kept
  | 'funny' // Inside jokes, playful moments
  | 'breakthrough' // Emotional or insight breakthroughs
  | 'celebration' // Wins, celebrations
  | 'first_share' // First time sharing something vulnerable
  | 'dream_progress'; // Steps toward a stated dream

/**
 * The emotional tone/feeling of a memory
 */
export type EmotionalTone =
  | 'joyful' // Happy, celebratory
  | 'meaningful' // Deep, significant
  | 'proud' // Achievement, accomplishment
  | 'tender' // Vulnerable, caring
  | 'funny' // Humorous, playful
  | 'bittersweet' // Mixed emotions, growth through difficulty
  | 'hopeful' // Looking forward, optimistic
  | 'grateful'; // Appreciation, thankfulness

/**
 * User reaction to a surfaced memory
 */
export type MemoryReaction = 'loved' | 'dismissed' | 'shared' | 'revisited';

/**
 * A surfaceable memory highlight
 */
export interface MemoryHighlight {
  id: string;
  userId: string;

  // Content
  content: string; // Human-readable summary (2-3 sentences max)
  originalContext?: string; // Raw conversation excerpt if available
  title?: string; // Optional short title

  // Classification
  type: MemoryType;
  emotionalTone: EmotionalTone;

  // Timing
  occurredAt: Date;
  surfaceableAfter?: Date; // Some memories need time to marinate

  // Relationships
  personaId?: string; // Which persona was involved
  topicTags: string[]; // Related topics
  peopleReferenced: string[]; // People mentioned in the memory

  // Source tracking
  sourceType: MemorySourceType;
  sourceId?: string; // ID from source system (commitment ID, etc.)

  // Scoring
  emotionalWeight: number; // 0-1, how emotionally significant
  uniqueness: number; // 0-1, how distinctive vs everyday
  growthIndicator: number; // 0-1, shows personal progress

  // Computed score (calculated at query time)
  score?: number;

  // Surfacing state
  timesSurfaced: number;
  lastSurfacedAt?: Date;
  reactions: MemoryReactionRecord[];

  // Metadata
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Record of a user's reaction to a memory
 */
export interface MemoryReactionRecord {
  reaction: MemoryReaction;
  reactedAt: Date;
  context?: string; // Where they reacted (browse, conversation, notification)
}

/**
 * Where a memory originated from
 */
export type MemorySourceType =
  | 'commitment_kept' // From commitment tracker
  | 'dream_progress' // From dream keeper
  | 'inside_joke' // From trust systems
  | 'milestone_reached' // From milestone service
  | 'coaching_moment' // From coaching persistence
  | 'emotional_breakthrough' // From conversation analysis
  | 'celebration' // From celebration momentum
  | 'first_vulnerability' // First time sharing something deep
  | 'relationship_event' // From relationship health
  | 'conversation_extract'; // Extracted from conversation

// ============================================================================
// COLLECTION TYPES
// ============================================================================

/**
 * Input for the memory collector from various sources
 */
export interface MemoryCollectionInput {
  userId: string;
  sourceType: MemorySourceType;
  sourceId: string;
  rawContent: string;
  occurredAt: Date;
  personaId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Result of processing a collection input
 */
export interface MemoryCollectionResult {
  success: boolean;
  memoryId?: string;
  error?: string;
  duplicate?: boolean;
}

// ============================================================================
// SCORING TYPES
// ============================================================================

/**
 * Context used for scoring memories
 */
export interface MemoryScoringContext {
  currentDate: Date;
  userTotalMemories: number;
  userFirstMemoryDate?: Date;
  queryContext?: {
    currentTopic?: string;
    currentEmotion?: string;
    isAnniversary?: boolean;
  };
}

/**
 * Scoring weights for different factors
 */
export interface ScoringWeights {
  emotionalWeight: number;
  uniqueness: number;
  growthIndicator: number;
  recency: number;
  anniversaryBoost: number;
  topicRelevance: number;
  neverSurfaced: number;
  userLoved: number;
}

/**
 * Default scoring weights
 */
export const DEFAULT_SCORING_WEIGHTS: ScoringWeights = {
  emotionalWeight: 0.25,
  uniqueness: 0.15,
  growthIndicator: 0.2,
  recency: 0.1,
  anniversaryBoost: 0.15, // Big boost for "on this day"
  topicRelevance: 0.1,
  neverSurfaced: 0.05, // Small boost for fresh memories
  userLoved: 0.1, // Boost for memories user loved before
};

// ============================================================================
// QUERY TYPES
// ============================================================================

/**
 * Options for querying memory highlights
 */
export interface MemoryQueryOptions {
  // Filters
  types?: MemoryType[];
  emotionalTones?: EmotionalTone[];
  personaId?: string;
  topicTags?: string[];

  // Time filters
  fromDate?: Date;
  toDate?: Date;
  isOnThisDay?: boolean; // Match same month/day from previous years

  // Surfacing state
  excludeRecentlySurfaced?: boolean;
  surfaceCooldownDays?: number;
  excludeDismissed?: boolean;

  // Pagination
  limit?: number;
  cursor?: string;

  // Sorting
  sortBy?: 'score' | 'date' | 'emotional_weight';
  sortOrder?: 'asc' | 'desc';
}

/**
 * Result of a memory query
 */
export interface MemoryQueryResult {
  memories: MemoryHighlight[];
  total: number;
  hasMore: boolean;
  nextCursor?: string;
}

/**
 * Options for the timeline view
 */
export interface TimelineQueryOptions {
  limit?: number;
  cursor?: string;
  groupBy?: 'month' | 'year';
}

/**
 * A grouped timeline entry
 */
export interface TimelineGroup {
  label: string; // "January 2025", "2024"
  startDate: Date;
  endDate: Date;
  memories: MemoryHighlight[];
  count: number;
}

/**
 * Result of a timeline query
 */
export interface TimelineQueryResult {
  groups: TimelineGroup[];
  totalMemories: number;
  hasMore: boolean;
  nextCursor?: string;
}

// ============================================================================
// API RESPONSE TYPES
// ============================================================================

/**
 * Response for GET /api/memories/highlights
 */
export interface HighlightsResponse {
  memories: MemoryHighlightDTO[];
  hasMore: boolean;
}

/**
 * Response for GET /api/memories/on-this-day
 */
export interface OnThisDayResponse {
  memories: MemoryHighlightDTO[];
  today: {
    month: number;
    date: number;
    formatted: string;
  };
  hasContent: boolean;
}

/**
 * Response for GET /api/memories/timeline
 */
export interface TimelineResponse {
  groups: Array<{
    label: string;
    memories: MemoryHighlightDTO[];
    count: number;
  }>;
  totalMemories: number;
  hasMore: boolean;
  nextCursor?: string;
}

/**
 * DTO for memory highlights sent to frontend
 */
export interface MemoryHighlightDTO {
  id: string;
  content: string;
  title?: string;
  type: MemoryType;
  emotionalTone: EmotionalTone;
  occurredAt: string; // ISO string
  personaId?: string;
  personaName?: string;
  topicTags: string[];
  yearAgo: number; // For "on this day" - how many years ago
  score?: number;
  userReaction?: MemoryReaction;
}

// ============================================================================
// PROACTIVE SURFACING TYPES
// ============================================================================

/**
 * Context for proactive surfacing during conversation
 */
export interface ProactiveSurfacingContext {
  userId: string;
  sessionId: string;
  currentTopic?: string;
  currentEmotion?: string;
  currentPersonaId: string;
  turnCount: number;
  recentlyMentionedPeople?: string[];
}

/**
 * A memory selected for proactive surfacing
 */
export interface ProactiveSurfaceableMemory {
  memory: MemoryHighlight;
  surfacingReason: SurfacingReason;
  promptFragment: string; // Suggested natural language to weave in
  confidence: number;
}

/**
 * Why a memory was selected for proactive surfacing
 */
export type SurfacingReason =
  | 'on_this_day' // Anniversary
  | 'topic_match' // Current topic relates to memory
  | 'person_mentioned' // User mentioned someone in the memory
  | 'growth_celebration' // Time to celebrate progress
  | 'emotional_echo' // Current emotion matches memory
  | 'dream_reminder'; // Time to check in on a dream

// ============================================================================
// FIRESTORE SCHEMA
// ============================================================================

/**
 * Firestore collection: bogle_users/{userId}/memory_highlights/{memoryId}
 */
export interface FirestoreMemoryHighlight {
  id: string;
  userId: string;
  content: string;
  originalContext?: string;
  title?: string;
  type: MemoryType;
  emotionalTone: EmotionalTone;
  occurredAt: FirestoreTimestamp;
  surfaceableAfter?: FirestoreTimestamp;
  personaId?: string;
  topicTags: string[];
  peopleReferenced: string[];
  sourceType: MemorySourceType;
  sourceId?: string;
  emotionalWeight: number;
  uniqueness: number;
  growthIndicator: number;
  timesSurfaced: number;
  lastSurfacedAt?: FirestoreTimestamp;
  reactions: Array<{
    reaction: MemoryReaction;
    reactedAt: FirestoreTimestamp;
    context?: string;
  }>;
  createdAt: FirestoreTimestamp;
  updatedAt: FirestoreTimestamp;
}

// Type for Firestore Timestamp (used in FirestoreMemoryHighlight)
export interface FirestoreTimestamp {
  toDate(): Date;
  seconds: number;
  nanoseconds: number;
}
