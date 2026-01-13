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
import { getLogger } from '../utils/safe-logger.js';
import { getIndexStats } from './advanced-retrieval.js';
import { getEmbeddingCache } from './embedding-cache.js';
import { getMemoryDeduplicator } from './memory-deduplication.js';
const log = getLogger();
// ============================================================================
// DEFAULT THRESHOLDS
// ============================================================================
const DEFAULT_THRESHOLDS = {
    maxRetrievalTimeMs: 500,
    minHitRate: 0.7,
    minEmbeddingCoverage: 0.8,
    maxFailureRate: 0.05,
};
// ============================================================================
// METRICS COLLECTOR
// ============================================================================
export class MemoryMetricsCollector {
    retrievalTimes = [];
    retrievalResultCounts = [];
    retrievalTopScores = [];
    emptyRetrievals = 0;
    totalRetrievals = 0;
    embeddingTimes = [];
    embeddingFailures = 0;
    totalEmbeddings = 0;
    estimatedTokens = 0;
    lastCollected = null;
    thresholds;
    constructor(thresholds) {
        this.thresholds = { ...DEFAULT_THRESHOLDS, ...thresholds };
    }
    /**
     * Record a retrieval operation
     */
    recordRetrieval(durationMs, resultCount, topScore) {
        this.totalRetrievals++;
        this.retrievalTimes.push(durationMs);
        this.retrievalResultCounts.push(resultCount);
        if (topScore !== undefined) {
            this.retrievalTopScores.push(topScore);
        }
        if (resultCount === 0) {
            this.emptyRetrievals++;
        }
        // Keep last 1000 measurements
        if (this.retrievalTimes.length > 1000) {
            this.retrievalTimes.shift();
            this.retrievalResultCounts.shift();
        }
        if (this.retrievalTopScores.length > 1000) {
            this.retrievalTopScores.shift();
        }
    }
    /**
     * Record an embedding operation
     */
    recordEmbedding(durationMs, tokenCount, success) {
        this.totalEmbeddings++;
        if (success) {
            this.embeddingTimes.push(durationMs);
            this.estimatedTokens += tokenCount;
        }
        else {
            this.embeddingFailures++;
        }
        // Keep last 1000 measurements
        if (this.embeddingTimes.length > 1000) {
            this.embeddingTimes.shift();
        }
    }
    /**
     * Collect all metrics
     */
    async collectMetrics() {
        const retrieval = this.collectRetrievalMetrics();
        const embedding = this.collectEmbeddingMetrics();
        const index = await this.collectIndexMetrics();
        const storage = await this.collectStorageMetrics();
        const deduplication = this.collectDeduplicationMetrics();
        this.lastCollected = new Date();
        return {
            retrieval,
            embedding,
            index,
            storage,
            deduplication,
            collectedAt: this.lastCollected,
        };
    }
    /**
     * Check metrics against thresholds and generate alerts
     */
    async checkThresholds() {
        const metrics = await this.collectMetrics();
        const alerts = [];
        // Check retrieval time
        if (metrics.retrieval.averageRetrievalTimeMs > this.thresholds.maxRetrievalTimeMs) {
            alerts.push({
                metric: 'averageRetrievalTimeMs',
                currentValue: metrics.retrieval.averageRetrievalTimeMs,
                threshold: this.thresholds.maxRetrievalTimeMs,
                severity: metrics.retrieval.averageRetrievalTimeMs > this.thresholds.maxRetrievalTimeMs * 2
                    ? 'critical'
                    : 'warning',
                message: `Retrieval time (${metrics.retrieval.averageRetrievalTimeMs.toFixed(0)}ms) exceeds threshold`,
                timestamp: new Date(),
            });
        }
        // Check hit rate
        if (metrics.retrieval.hitRate < this.thresholds.minHitRate) {
            alerts.push({
                metric: 'hitRate',
                currentValue: metrics.retrieval.hitRate,
                threshold: this.thresholds.minHitRate,
                severity: metrics.retrieval.hitRate < this.thresholds.minHitRate * 0.5 ? 'critical' : 'warning',
                message: `Hit rate (${(metrics.retrieval.hitRate * 100).toFixed(1)}%) below threshold`,
                timestamp: new Date(),
            });
        }
        // Check embedding coverage
        if (metrics.index.embeddingCoverage < this.thresholds.minEmbeddingCoverage) {
            alerts.push({
                metric: 'embeddingCoverage',
                currentValue: metrics.index.embeddingCoverage,
                threshold: this.thresholds.minEmbeddingCoverage,
                severity: 'warning',
                message: `Embedding coverage (${(metrics.index.embeddingCoverage * 100).toFixed(1)}%) below threshold`,
                timestamp: new Date(),
            });
        }
        // Check failure rate
        const failureRate = metrics.embedding.failures / Math.max(1, metrics.embedding.totalGenerations);
        if (failureRate > this.thresholds.maxFailureRate) {
            alerts.push({
                metric: 'embeddingFailureRate',
                currentValue: failureRate,
                threshold: this.thresholds.maxFailureRate,
                severity: failureRate > this.thresholds.maxFailureRate * 2 ? 'critical' : 'warning',
                message: `Embedding failure rate (${(failureRate * 100).toFixed(1)}%) exceeds threshold`,
                timestamp: new Date(),
            });
        }
        if (alerts.length > 0) {
            log.warn({ alertCount: alerts.length }, 'Memory metrics alerts generated');
        }
        return alerts;
    }
    /**
     * Reset all metrics (for testing)
     */
    reset() {
        this.retrievalTimes = [];
        this.retrievalResultCounts = [];
        this.retrievalTopScores = [];
        this.emptyRetrievals = 0;
        this.totalRetrievals = 0;
        this.embeddingTimes = [];
        this.embeddingFailures = 0;
        this.totalEmbeddings = 0;
        this.estimatedTokens = 0;
        this.lastCollected = null;
    }
    // ============================================================================
    // PRIVATE COLLECTION METHODS
    // ============================================================================
    collectRetrievalMetrics() {
        const avgTime = this.average(this.retrievalTimes);
        const p95Time = this.percentile(this.retrievalTimes, 0.95);
        const avgResultCount = this.average(this.retrievalResultCounts);
        const avgTopScore = this.average(this.retrievalTopScores);
        const hitRate = this.totalRetrievals > 0
            ? (this.totalRetrievals - this.emptyRetrievals) / this.totalRetrievals
            : 0;
        return {
            totalRetrievals: this.totalRetrievals,
            averageRetrievalTimeMs: avgTime,
            p95RetrievalTimeMs: p95Time,
            emptyRetrievals: this.emptyRetrievals,
            hitRate,
            averageResultCount: avgResultCount,
            averageTopScore: avgTopScore,
        };
    }
    collectEmbeddingMetrics() {
        const cache = getEmbeddingCache();
        const cacheStats = cache.getStats();
        return {
            totalGenerations: this.totalEmbeddings,
            cacheHitRate: cacheStats.hitRate,
            averageGenerationTimeMs: this.average(this.embeddingTimes),
            apiCalls: cacheStats.misses,
            failures: this.embeddingFailures,
            estimatedTokens: this.estimatedTokens,
        };
    }
    async collectIndexMetrics() {
        const stats = getIndexStats();
        return {
            indexedUsers: stats.userCount,
            totalMemories: stats.totalMemories,
            memoriesWithEmbeddings: stats.memoriesWithEmbeddings,
            embeddingCoverage: stats.totalMemories > 0 ? stats.memoriesWithEmbeddings / stats.totalMemories : 0,
            averageMemoriesPerUser: stats.userCount > 0 ? stats.totalMemories / stats.userCount : 0,
            lastUpdated: this.lastCollected,
        };
    }
    async collectStorageMetrics() {
        // Default values - would be populated from actual stores
        return {
            storeType: 'memory',
            vectorStoreType: 'memory',
            usingFallback: false,
            estimatedSizeBytes: 0,
            documentsBySource: {},
        };
    }
    collectDeduplicationMetrics() {
        const dedup = getMemoryDeduplicator();
        const stats = dedup.getStats();
        // Estimate storage saved (rough approximation)
        const avgDocSizeBytes = 2000; // Average document with embedding
        const estimatedSaved = stats.storageBypass * avgDocSizeBytes;
        return {
            ...stats,
            estimatedStorageSaved: estimatedSaved,
        };
    }
    // ============================================================================
    // UTILITY METHODS
    // ============================================================================
    average(values) {
        if (values.length === 0)
            return 0;
        return values.reduce((a, b) => a + b, 0) / values.length;
    }
    percentile(values, p) {
        if (values.length === 0)
            return 0;
        const sorted = [...values].sort((a, b) => a - b);
        const index = Math.ceil(p * sorted.length) - 1;
        return sorted[Math.max(0, index)];
    }
}
// ============================================================================
// SINGLETON
// ============================================================================
let defaultCollector = null;
/**
 * Get the default metrics collector
 */
export function getMemoryMetricsCollector(thresholds) {
    if (!defaultCollector) {
        defaultCollector = new MemoryMetricsCollector(thresholds);
    }
    return defaultCollector;
}
/**
 * Reset the collector (for testing)
 */
export function resetMemoryMetricsCollector() {
    if (defaultCollector) {
        defaultCollector.reset();
        defaultCollector = null;
    }
}
/**
 * Convenience function to collect metrics
 */
export async function collectMemoryMetrics() {
    return getMemoryMetricsCollector().collectMetrics();
}
/**
 * Convenience function to check thresholds
 */
export async function checkMemoryHealthAlerts() {
    return getMemoryMetricsCollector().checkThresholds();
}
export default {
    MemoryMetricsCollector,
    getMemoryMetricsCollector,
    resetMemoryMetricsCollector,
    collectMemoryMetrics,
    checkMemoryHealthAlerts,
};
//# sourceMappingURL=memory-metrics.js.map