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
import { getLogger } from '../../utils/safe-logger.js';
const log = getLogger();
// ============================================================================
// STATE
// ============================================================================
const searchEvents = [];
const embeddingEvents = [];
const MAX_EVENTS = 1000;
let currentStoreType = 'memory';
let documentCount = 0;
const storageBySource = {};
// ============================================================================
// RECORDING
// ============================================================================
export function recordVectorSearch(event) {
    const fullEvent = {
        ...event,
        id: `search_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        timestamp: Date.now(),
    };
    searchEvents.push(fullEvent);
    if (searchEvents.length > MAX_EVENTS) {
        searchEvents.shift();
    }
    log.debug({ latencyMs: event.latencyMs, results: event.resultsCount }, 'Vector search recorded');
}
export function recordEmbedding(event) {
    const fullEvent = {
        ...event,
        id: `embed_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        timestamp: Date.now(),
    };
    embeddingEvents.push(fullEvent);
    if (embeddingEvents.length > MAX_EVENTS) {
        embeddingEvents.shift();
    }
    if (!event.success) {
        log.warn({ provider: event.provider, error: event.error }, 'Embedding generation failed');
    }
}
export function updateStorageStats(storeType, count, bySource) {
    currentStoreType = storeType;
    documentCount = count;
    if (bySource) {
        Object.assign(storageBySource, bySource);
    }
}
// ============================================================================
// SNAPSHOT
// ============================================================================
export function getSnapshot() {
    const recentSearches = searchEvents.filter((e) => e.timestamp > Date.now() - 5 * 60 * 1000);
    const recentEmbeddings = embeddingEvents.filter((e) => e.timestamp > Date.now() - 5 * 60 * 1000);
    // Search metrics
    const searchLatencies = recentSearches.map((e) => e.latencyMs);
    const avgSearchLatencyMs = searchLatencies.length > 0
        ? searchLatencies.reduce((a, b) => a + b, 0) / searchLatencies.length
        : 0;
    const sortedLatencies = [...searchLatencies].sort((a, b) => a - b);
    const p95SearchLatencyMs = sortedLatencies[Math.floor(sortedLatencies.length * 0.95)] || 0;
    const avgResultsPerQuery = recentSearches.length > 0
        ? recentSearches.reduce((sum, e) => sum + e.resultsCount, 0) / recentSearches.length
        : 0;
    const avgTopScore = recentSearches.length > 0
        ? recentSearches.reduce((sum, e) => sum + e.topScore, 0) / recentSearches.length
        : 0;
    const avgRelevanceScore = recentSearches.length > 0
        ? recentSearches.reduce((sum, e) => sum + e.avgScore, 0) / recentSearches.length
        : 0;
    // Cache metrics
    const cacheHits = recentSearches.filter((e) => e.cacheHit).length;
    const cacheHitRate = recentSearches.length > 0 ? cacheHits / recentSearches.length : 0;
    // Embedding metrics
    const embeddingLatencies = recentEmbeddings.filter((e) => e.success).map((e) => e.latencyMs);
    const avgEmbeddingLatencyMs = embeddingLatencies.length > 0
        ? embeddingLatencies.reduce((a, b) => a + b, 0) / embeddingLatencies.length
        : 0;
    const embeddingErrors = recentEmbeddings.filter((e) => !e.success).length;
    const embeddingErrorRate = recentEmbeddings.length > 0 ? embeddingErrors / recentEmbeddings.length : 0;
    // Quality metrics
    const lowRelevanceSearches = recentSearches.filter((e) => e.avgScore < 0.5).length;
    const emptyResultSearches = recentSearches.filter((e) => e.resultsCount === 0).length;
    return {
        avgSearchLatencyMs,
        p95SearchLatencyMs,
        avgResultsPerQuery,
        avgTopScore,
        avgRelevanceScore,
        searchesPerMinute: recentSearches.length / 5,
        cacheHitRate,
        cacheMisses: recentSearches.length - cacheHits,
        avgEmbeddingLatencyMs,
        embeddingsGenerated: recentEmbeddings.length,
        embeddingErrorRate,
        documentsStored: documentCount,
        storageBySource: { ...storageBySource },
        storeType: currentStoreType,
        lowRelevanceSearches,
        emptyResultSearches,
    };
}
// ============================================================================
// EXPORT
// ============================================================================
export const memoryMetrics = {
    recordVectorSearch,
    recordEmbedding,
    updateStorageStats,
    getSnapshot,
};
//# sourceMappingURL=memory-health.js.map