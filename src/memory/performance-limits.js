/**
 * Memory Performance Limits
 *
 * Centralized limits for memory queries to prevent unbounded fetches
 * and ensure consistent "Better than Human" response times.
 *
 * @module memory/performance-limits
 */
// ============================================================================
// QUERY LIMITS
// ============================================================================
/**
 * Maximum items to fetch per query type
 * These limits balance data richness with response time
 */
export const QUERY_LIMITS = {
    /** Max associative memory triggers to load per user */
    ASSOCIATIVE_TRIGGERS: 50,
    /** Max behavioral patterns to load per user */
    BEHAVIORAL_PATTERNS: 20,
    /** Max emotional threads to load per user */
    EMOTIONAL_THREADS: 30,
    /** Max memories to search in RAG */
    RAG_SEARCH: 15,
    /** Max conversation summaries to retrieve */
    CONVERSATION_SUMMARIES: 10,
    /** Max facts to retrieve per query */
    EXTRACTED_FACTS: 25,
    /** Max commitments to track */
    COMMITMENTS: 20,
    /** Max values to retrieve */
    VALUES: 15,
    /** Max relationships to load */
    RELATIONSHIPS: 50,
    /** Max dreams/aspirations to track */
    DREAMS: 10,
};
// ============================================================================
// CACHE TTLS
// ============================================================================
/**
 * Cache TTLs for different memory types (in milliseconds)
 */
export const CACHE_TTLS = {
    /** User profile - changes rarely */
    PROFILE: 5 * 60 * 1000, // 5 minutes
    /** Associative triggers - session-scoped */
    ASSOCIATIVE_TRIGGERS: 2 * 60 * 1000, // 2 minutes
    /** Behavioral patterns - evolve slowly */
    BEHAVIORAL_PATTERNS: 5 * 60 * 1000, // 5 minutes
    /** Emotional threads - can change during session */
    EMOTIONAL_THREADS: 60 * 1000, // 1 minute
    /** RAG search results */
    RAG_RESULTS: 30 * 1000, // 30 seconds
    /** Conversation summaries */
    SUMMARIES: 5 * 60 * 1000, // 5 minutes
    /** Persona insights - computed on handoff */
    PERSONA_INSIGHTS: 3 * 60 * 1000, // 3 minutes
};
// ============================================================================
// BATCH SIZES
// ============================================================================
/**
 * Batch sizes for bulk operations
 */
export const BATCH_SIZES = {
    /** Firestore batch write limit */
    FIRESTORE_WRITE: 500,
    /** Embedding generation batch */
    EMBEDDINGS: 20,
    /** Parallel query concurrency */
    PARALLEL_QUERIES: 5,
};
// ============================================================================
// TIMEOUT LIMITS
// ============================================================================
/**
 * Timeouts for memory operations (in milliseconds)
 */
export const MEMORY_TIMEOUTS = {
    /** Single Firestore query */
    SINGLE_QUERY: 2000,
    /** Parallel query (all shards) */
    PARALLEL_QUERY: 3000,
    /** Embedding generation */
    EMBEDDING: 5000,
    /** Full memory load for session */
    FULL_LOAD: 5000,
    /** Cache warmup */
    WARMUP: 8000,
};
// ============================================================================
// HELPER: Apply limit to Firestore query
// ============================================================================
/**
 * Get the appropriate limit for a query type
 */
export function getQueryLimit(queryType, requestedLimit) {
    const maxLimit = QUERY_LIMITS[queryType];
    if (requestedLimit === undefined) {
        return maxLimit;
    }
    return Math.min(requestedLimit, maxLimit);
}
/**
 * Get cache TTL for a data type
 */
export function getCacheTTL(dataType) {
    return CACHE_TTLS[dataType];
}
export default {
    QUERY_LIMITS,
    CACHE_TTLS,
    BATCH_SIZES,
    MEMORY_TIMEOUTS,
    getQueryLimit,
    getCacheTTL,
};
//# sourceMappingURL=performance-limits.js.map