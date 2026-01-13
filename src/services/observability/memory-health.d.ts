/**
 * Memory/RAG Health Metrics
 *
 * Tracks memory system and RAG performance:
 * - Vector search latency
 * - Search relevance scores
 * - Storage utilization
 * - Cache hit rates
 * - Embedding generation times
 */
export interface VectorSearchEvent {
    id: string;
    timestamp: number;
    userId: string;
    queryLength: number;
    resultsCount: number;
    topScore: number;
    avgScore: number;
    latencyMs: number;
    cacheHit: boolean;
    storeType: 'memory' | 'firestore' | 'postgres';
}
export interface EmbeddingEvent {
    id: string;
    timestamp: number;
    provider: string;
    textLength: number;
    dimensions: number;
    latencyMs: number;
    success: boolean;
    error?: string;
}
export interface MemoryHealthSnapshot {
    avgSearchLatencyMs: number;
    p95SearchLatencyMs: number;
    avgResultsPerQuery: number;
    avgTopScore: number;
    avgRelevanceScore: number;
    searchesPerMinute: number;
    cacheHitRate: number;
    cacheMisses: number;
    avgEmbeddingLatencyMs: number;
    embeddingsGenerated: number;
    embeddingErrorRate: number;
    documentsStored: number;
    storageBySource: Record<string, number>;
    storeType: string;
    lowRelevanceSearches: number;
    emptyResultSearches: number;
}
export declare function recordVectorSearch(event: Omit<VectorSearchEvent, 'id' | 'timestamp'>): void;
export declare function recordEmbedding(event: Omit<EmbeddingEvent, 'id' | 'timestamp'>): void;
export declare function updateStorageStats(storeType: string, count: number, bySource?: Record<string, number>): void;
export declare function getSnapshot(): MemoryHealthSnapshot;
export declare const memoryMetrics: {
    recordVectorSearch: typeof recordVectorSearch;
    recordEmbedding: typeof recordEmbedding;
    updateStorageStats: typeof updateStorageStats;
    getSnapshot: typeof getSnapshot;
};
//# sourceMappingURL=memory-health.d.ts.map