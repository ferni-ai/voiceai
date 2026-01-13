/**
 * Memory Metrics & Observability
 *
 * Provides comprehensive monitoring for the memory system to ensure
 * healthy operation and catch issues before they impact users.
 *
 * Philosophy: We can't improve what we don't measure. Memory metrics
 * help us understand:
 * - Is semantic search finding relevant results?
 * - Are embeddings being generated efficiently?
 * - Is the memory index healthy?
 * - Where are the bottlenecks?
 */
/**
 * Retrieval performance metrics
 */
export interface RetrievalMetrics {
    /** Total retrieval operations */
    totalRetrievals: number;
    /** Average retrieval time in ms */
    averageRetrievalTimeMs: number;
    /** 95th percentile retrieval time */
    p95RetrievalTimeMs: number;
    /** Retrieval operations that found no results */
    emptyRetrievals: number;
    /** Percentage of queries that found results */
    hitRate: number;
    /** Average number of results per retrieval */
    averageResultCount: number;
    /** Average relevance score of top result */
    averageTopScore: number;
}
/**
 * Embedding metrics
 */
export interface EmbeddingMetrics {
    /** Total embedding generations */
    totalGenerations: number;
    /** Cache hit rate (if caching enabled) */
    cacheHitRate: number;
    /** Average generation time in ms */
    averageGenerationTimeMs: number;
    /** Total API calls made */
    apiCalls: number;
    /** Failed embedding attempts */
    failures: number;
    /** Estimated token usage */
    estimatedTokens: number;
}
/**
 * Index health metrics
 */
export interface IndexMetrics {
    /** Total users with indexed memories */
    indexedUsers: number;
    /** Total memories across all users */
    totalMemories: number;
    /** Memories with embeddings */
    memoriesWithEmbeddings: number;
    /** Embedding coverage percentage */
    embeddingCoverage: number;
    /** Average memories per user */
    averageMemoriesPerUser: number;
    /** Index last updated */
    lastUpdated: Date | null;
}
/**
 * Storage metrics
 */
export interface StorageMetrics {
    /** Current store type */
    storeType: 'memory' | 'firestore' | 'postgres';
    /** Vector store type */
    vectorStoreType: 'memory' | 'firestore';
    /** Is using fallback mode */
    usingFallback: boolean;
    /** Approximate storage size in bytes */
    estimatedSizeBytes: number;
    /** Document count by source */
    documentsBySource: Record<string, number>;
}
/**
 * Deduplication metrics
 */
export interface DeduplicationMetrics {
    /** Duplicate checks performed */
    checksPerformed: number;
    /** Duplicates detected */
    duplicatesFound: number;
    /** Merges performed */
    mergesPerformed: number;
    /** Storage operations skipped */
    storageBypass: number;
    /** Average similarity of checked pairs */
    averageSimilarity: number;
    /** Estimated storage saved in bytes */
    estimatedStorageSaved: number;
}
/**
 * Complete memory system metrics
 */
export interface MemoryMetrics {
    retrieval: RetrievalMetrics;
    embedding: EmbeddingMetrics;
    index: IndexMetrics;
    storage: StorageMetrics;
    deduplication: DeduplicationMetrics;
    collectedAt: Date;
}
/**
 * Alert thresholds for metrics
 */
export interface MetricThresholds {
    /** Max acceptable average retrieval time (ms) */
    maxRetrievalTimeMs: number;
    /** Minimum acceptable hit rate */
    minHitRate: number;
    /** Minimum acceptable embedding coverage */
    minEmbeddingCoverage: number;
    /** Maximum acceptable failure rate */
    maxFailureRate: number;
}
/**
 * Alert generated from threshold violation
 */
export interface MetricAlert {
    metric: string;
    currentValue: number;
    threshold: number;
    severity: 'warning' | 'critical';
    message: string;
    timestamp: Date;
}
export declare class MemoryMetricsCollector {
    private retrievalTimes;
    private retrievalResultCounts;
    private retrievalTopScores;
    private emptyRetrievals;
    private totalRetrievals;
    private embeddingTimes;
    private embeddingFailures;
    private totalEmbeddings;
    private estimatedTokens;
    private lastCollected;
    private thresholds;
    constructor(thresholds?: Partial<MetricThresholds>);
    /**
     * Record a retrieval operation
     */
    recordRetrieval(durationMs: number, resultCount: number, topScore: number | undefined): void;
    /**
     * Record an embedding operation
     */
    recordEmbedding(durationMs: number, tokenCount: number, success: boolean): void;
    /**
     * Collect all metrics
     */
    collectMetrics(): Promise<MemoryMetrics>;
    /**
     * Check metrics against thresholds and generate alerts
     */
    checkThresholds(): Promise<MetricAlert[]>;
    /**
     * Reset all metrics (for testing)
     */
    reset(): void;
    private collectRetrievalMetrics;
    private collectEmbeddingMetrics;
    private collectIndexMetrics;
    private collectStorageMetrics;
    private collectDeduplicationMetrics;
    private average;
    private percentile;
}
/**
 * Get the default metrics collector
 */
export declare function getMemoryMetricsCollector(thresholds?: Partial<MetricThresholds>): MemoryMetricsCollector;
/**
 * Reset the collector (for testing)
 */
export declare function resetMemoryMetricsCollector(): void;
/**
 * Convenience function to collect metrics
 */
export declare function collectMemoryMetrics(): Promise<MemoryMetrics>;
/**
 * Convenience function to check thresholds
 */
export declare function checkMemoryHealthAlerts(): Promise<MetricAlert[]>;
declare const _default: {
    MemoryMetricsCollector: typeof MemoryMetricsCollector;
    getMemoryMetricsCollector: typeof getMemoryMetricsCollector;
    resetMemoryMetricsCollector: typeof resetMemoryMetricsCollector;
    collectMemoryMetrics: typeof collectMemoryMetrics;
    checkMemoryHealthAlerts: typeof checkMemoryHealthAlerts;
};
export default _default;
//# sourceMappingURL=memory-metrics.d.ts.map