/**
 * Memory Performance Limits
 *
 * Centralized limits for memory queries to prevent unbounded fetches
 * and ensure consistent "Better than Human" response times.
 *
 * @module memory/performance-limits
 */
/**
 * Maximum items to fetch per query type
 * These limits balance data richness with response time
 */
export declare const QUERY_LIMITS: {
    /** Max associative memory triggers to load per user */
    readonly ASSOCIATIVE_TRIGGERS: 50;
    /** Max behavioral patterns to load per user */
    readonly BEHAVIORAL_PATTERNS: 20;
    /** Max emotional threads to load per user */
    readonly EMOTIONAL_THREADS: 30;
    /** Max memories to search in RAG */
    readonly RAG_SEARCH: 15;
    /** Max conversation summaries to retrieve */
    readonly CONVERSATION_SUMMARIES: 10;
    /** Max facts to retrieve per query */
    readonly EXTRACTED_FACTS: 25;
    /** Max commitments to track */
    readonly COMMITMENTS: 20;
    /** Max values to retrieve */
    readonly VALUES: 15;
    /** Max relationships to load */
    readonly RELATIONSHIPS: 50;
    /** Max dreams/aspirations to track */
    readonly DREAMS: 10;
};
/**
 * Cache TTLs for different memory types (in milliseconds)
 */
export declare const CACHE_TTLS: {
    /** User profile - changes rarely */
    readonly PROFILE: number;
    /** Associative triggers - session-scoped */
    readonly ASSOCIATIVE_TRIGGERS: number;
    /** Behavioral patterns - evolve slowly */
    readonly BEHAVIORAL_PATTERNS: number;
    /** Emotional threads - can change during session */
    readonly EMOTIONAL_THREADS: number;
    /** RAG search results */
    readonly RAG_RESULTS: number;
    /** Conversation summaries */
    readonly SUMMARIES: number;
    /** Persona insights - computed on handoff */
    readonly PERSONA_INSIGHTS: number;
};
/**
 * Batch sizes for bulk operations
 */
export declare const BATCH_SIZES: {
    /** Firestore batch write limit */
    readonly FIRESTORE_WRITE: 500;
    /** Embedding generation batch */
    readonly EMBEDDINGS: 20;
    /** Parallel query concurrency */
    readonly PARALLEL_QUERIES: 5;
};
/**
 * Timeouts for memory operations (in milliseconds)
 */
export declare const MEMORY_TIMEOUTS: {
    /** Single Firestore query */
    readonly SINGLE_QUERY: 2000;
    /** Parallel query (all shards) */
    readonly PARALLEL_QUERY: 3000;
    /** Embedding generation */
    readonly EMBEDDING: 5000;
    /** Full memory load for session */
    readonly FULL_LOAD: 5000;
    /** Cache warmup */
    readonly WARMUP: 8000;
};
/**
 * Get the appropriate limit for a query type
 */
export declare function getQueryLimit(queryType: keyof typeof QUERY_LIMITS, requestedLimit?: number): number;
/**
 * Get cache TTL for a data type
 */
export declare function getCacheTTL(dataType: keyof typeof CACHE_TTLS): number;
declare const _default: {
    QUERY_LIMITS: {
        /** Max associative memory triggers to load per user */
        readonly ASSOCIATIVE_TRIGGERS: 50;
        /** Max behavioral patterns to load per user */
        readonly BEHAVIORAL_PATTERNS: 20;
        /** Max emotional threads to load per user */
        readonly EMOTIONAL_THREADS: 30;
        /** Max memories to search in RAG */
        readonly RAG_SEARCH: 15;
        /** Max conversation summaries to retrieve */
        readonly CONVERSATION_SUMMARIES: 10;
        /** Max facts to retrieve per query */
        readonly EXTRACTED_FACTS: 25;
        /** Max commitments to track */
        readonly COMMITMENTS: 20;
        /** Max values to retrieve */
        readonly VALUES: 15;
        /** Max relationships to load */
        readonly RELATIONSHIPS: 50;
        /** Max dreams/aspirations to track */
        readonly DREAMS: 10;
    };
    CACHE_TTLS: {
        /** User profile - changes rarely */
        readonly PROFILE: number;
        /** Associative triggers - session-scoped */
        readonly ASSOCIATIVE_TRIGGERS: number;
        /** Behavioral patterns - evolve slowly */
        readonly BEHAVIORAL_PATTERNS: number;
        /** Emotional threads - can change during session */
        readonly EMOTIONAL_THREADS: number;
        /** RAG search results */
        readonly RAG_RESULTS: number;
        /** Conversation summaries */
        readonly SUMMARIES: number;
        /** Persona insights - computed on handoff */
        readonly PERSONA_INSIGHTS: number;
    };
    BATCH_SIZES: {
        /** Firestore batch write limit */
        readonly FIRESTORE_WRITE: 500;
        /** Embedding generation batch */
        readonly EMBEDDINGS: 20;
        /** Parallel query concurrency */
        readonly PARALLEL_QUERIES: 5;
    };
    MEMORY_TIMEOUTS: {
        /** Single Firestore query */
        readonly SINGLE_QUERY: 2000;
        /** Parallel query (all shards) */
        readonly PARALLEL_QUERY: 3000;
        /** Embedding generation */
        readonly EMBEDDING: 5000;
        /** Full memory load for session */
        readonly FULL_LOAD: 5000;
        /** Cache warmup */
        readonly WARMUP: 8000;
    };
    getQueryLimit: typeof getQueryLimit;
    getCacheTTL: typeof getCacheTTL;
};
export default _default;
//# sourceMappingURL=performance-limits.d.ts.map