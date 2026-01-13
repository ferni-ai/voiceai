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
/**
 * The types of memorable moments we capture
 */
export type MemoryType = 'milestone' | 'growth' | 'connection' | 'commitment' | 'funny' | 'breakthrough' | 'celebration' | 'first_share' | 'dream_progress';
/**
 * The emotional tone/feeling of a memory
 */
export type EmotionalTone = 'joyful' | 'meaningful' | 'proud' | 'tender' | 'funny' | 'bittersweet' | 'hopeful' | 'grateful';
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
    content: string;
    originalContext?: string;
    title?: string;
    type: MemoryType;
    emotionalTone: EmotionalTone;
    occurredAt: Date;
    surfaceableAfter?: Date;
    personaId?: string;
    topicTags: string[];
    peopleReferenced: string[];
    sourceType: MemorySourceType;
    sourceId?: string;
    emotionalWeight: number;
    uniqueness: number;
    growthIndicator: number;
    score?: number;
    timesSurfaced: number;
    lastSurfacedAt?: Date;
    reactions: MemoryReactionRecord[];
    createdAt: Date;
    updatedAt: Date;
}
/**
 * Record of a user's reaction to a memory
 */
export interface MemoryReactionRecord {
    reaction: MemoryReaction;
    reactedAt: Date;
    context?: string;
}
/**
 * Where a memory originated from
 */
export type MemorySourceType = 'commitment_kept' | 'dream_progress' | 'inside_joke' | 'milestone_reached' | 'coaching_moment' | 'emotional_breakthrough' | 'celebration' | 'first_vulnerability' | 'relationship_event' | 'conversation_extract';
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
export declare const DEFAULT_SCORING_WEIGHTS: ScoringWeights;
/**
 * Options for querying memory highlights
 */
export interface MemoryQueryOptions {
    types?: MemoryType[];
    emotionalTones?: EmotionalTone[];
    personaId?: string;
    topicTags?: string[];
    fromDate?: Date;
    toDate?: Date;
    isOnThisDay?: boolean;
    excludeRecentlySurfaced?: boolean;
    surfaceCooldownDays?: number;
    excludeDismissed?: boolean;
    limit?: number;
    cursor?: string;
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
    label: string;
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
    occurredAt: string;
    personaId?: string;
    personaName?: string;
    topicTags: string[];
    yearAgo: number;
    score?: number;
    userReaction?: MemoryReaction;
}
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
    promptFragment: string;
    confidence: number;
}
/**
 * Why a memory was selected for proactive surfacing
 */
export type SurfacingReason = 'on_this_day' | 'topic_match' | 'person_mentioned' | 'growth_celebration' | 'emotional_echo' | 'dream_reminder';
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
export interface FirestoreTimestamp {
    toDate(): Date;
    seconds: number;
    nanoseconds: number;
}
//# sourceMappingURL=types.d.ts.map