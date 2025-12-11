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
// TYPES
// ============================================================================

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

// ============================================================================
// DEFAULT THRESHOLDS
// ============================================================================

const DEFAULT_THRESHOLDS: MetricThresholds = {
  maxRetrievalTimeMs: 500,
  minHitRate: 0.7,
  minEmbeddingCoverage: 0.8,
  maxFailureRate: 0.05,
};

// ============================================================================
// METRICS COLLECTOR
// ============================================================================

export class MemoryMetricsCollector {
  private retrievalTimes: number[] = [];
  private retrievalResultCounts: number[] = [];
  private retrievalTopScores: number[] = [];
  private emptyRetrievals = 0;
  private totalRetrievals = 0;

  private embeddingTimes: number[] = [];
  private embeddingFailures = 0;
  private totalEmbeddings = 0;
  private estimatedTokens = 0;

  private lastCollected: Date | null = null;
  private thresholds: MetricThresholds;

  constructor(thresholds?: Partial<MetricThresholds>) {
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...thresholds };
  }

  /**
   * Record a retrieval operation
   */
  recordRetrieval(durationMs: number, resultCount: number, topScore: number | undefined): void {
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
  recordEmbedding(durationMs: number, tokenCount: number, success: boolean): void {
    this.totalEmbeddings++;

    if (success) {
      this.embeddingTimes.push(durationMs);
      this.estimatedTokens += tokenCount;
    } else {
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
  async collectMetrics(): Promise<MemoryMetrics> {
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
  async checkThresholds(): Promise<MetricAlert[]> {
    const metrics = await this.collectMetrics();
    const alerts: MetricAlert[] = [];

    // Check retrieval time
    if (metrics.retrieval.averageRetrievalTimeMs > this.thresholds.maxRetrievalTimeMs) {
      alerts.push({
        metric: 'averageRetrievalTimeMs',
        currentValue: metrics.retrieval.averageRetrievalTimeMs,
        threshold: this.thresholds.maxRetrievalTimeMs,
        severity:
          metrics.retrieval.averageRetrievalTimeMs > this.thresholds.maxRetrievalTimeMs * 2
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
        severity:
          metrics.retrieval.hitRate < this.thresholds.minHitRate * 0.5 ? 'critical' : 'warning',
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
    const failureRate =
      metrics.embedding.failures / Math.max(1, metrics.embedding.totalGenerations);
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
  reset(): void {
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

  private collectRetrievalMetrics(): RetrievalMetrics {
    const avgTime = this.average(this.retrievalTimes);
    const p95Time = this.percentile(this.retrievalTimes, 0.95);
    const avgResultCount = this.average(this.retrievalResultCounts);
    const avgTopScore = this.average(this.retrievalTopScores);
    const hitRate =
      this.totalRetrievals > 0
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

  private collectEmbeddingMetrics(): EmbeddingMetrics {
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

  private async collectIndexMetrics(): Promise<IndexMetrics> {
    const stats = getIndexStats();

    return {
      indexedUsers: stats.userCount,
      totalMemories: stats.totalMemories,
      memoriesWithEmbeddings: stats.memoriesWithEmbeddings,
      embeddingCoverage:
        stats.totalMemories > 0 ? stats.memoriesWithEmbeddings / stats.totalMemories : 0,
      averageMemoriesPerUser: stats.userCount > 0 ? stats.totalMemories / stats.userCount : 0,
      lastUpdated: this.lastCollected,
    };
  }

  private async collectStorageMetrics(): Promise<StorageMetrics> {
    // Default values - would be populated from actual stores
    return {
      storeType: 'memory',
      vectorStoreType: 'memory',
      usingFallback: false,
      estimatedSizeBytes: 0,
      documentsBySource: {},
    };
  }

  private collectDeduplicationMetrics(): DeduplicationMetrics {
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

  private average(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  private percentile(values: number[], p: number): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil(p * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let defaultCollector: MemoryMetricsCollector | null = null;

/**
 * Get the default metrics collector
 */
export function getMemoryMetricsCollector(
  thresholds?: Partial<MetricThresholds>
): MemoryMetricsCollector {
  if (!defaultCollector) {
    defaultCollector = new MemoryMetricsCollector(thresholds);
  }
  return defaultCollector;
}

/**
 * Reset the collector (for testing)
 */
export function resetMemoryMetricsCollector(): void {
  if (defaultCollector) {
    defaultCollector.reset();
    defaultCollector = null;
  }
}

/**
 * Convenience function to collect metrics
 */
export async function collectMemoryMetrics(): Promise<MemoryMetrics> {
  return getMemoryMetricsCollector().collectMetrics();
}

/**
 * Convenience function to check thresholds
 */
export async function checkMemoryHealthAlerts(): Promise<MetricAlert[]> {
  return getMemoryMetricsCollector().checkThresholds();
}

export default {
  MemoryMetricsCollector,
  getMemoryMetricsCollector,
  resetMemoryMetricsCollector,
  collectMemoryMetrics,
  checkMemoryHealthAlerts,
};
