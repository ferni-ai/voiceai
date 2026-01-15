/**
 * Data Layer Health Checks
 *
 * Provides health status, metrics, and diagnostics for the unified data layer.
 *
 * @module services/data-layer/health
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getProductivityStore } from '../stores/productivity-store.js';
import { getFinancialStore } from '../stores/financial-store.js';
import { getLifeDataStore } from '../stores/life-data-store.js';
import { getFirestoreVectorStore } from '../memory/firestore-vector-store/index.js';
import { getIndexingMetrics } from './store-hooks.js';
import { getSessionMetrics } from './session-integration.js';
import type { DataLayerHealth, DataLayerMetrics, HealthStatus } from './types.js';

const log = createLogger({ module: 'data-layer-health' });

// ============================================================================
// METRICS TRACKING
// ============================================================================

interface QueryMetrics {
  totalQueries: number;
  cacheHits: number;
  semanticSearches: number;
  semanticHits: number;
  errors: number;
  totalLatencyMs: number;
}

const metrics: QueryMetrics = {
  totalQueries: 0,
  cacheHits: 0,
  semanticSearches: 0,
  semanticHits: 0,
  errors: 0,
  totalLatencyMs: 0,
};

/**
 * Record a query for metrics
 */
export function recordQuery(options: {
  cacheHit: boolean;
  semanticSearch?: boolean;
  semanticHit?: boolean;
  latencyMs: number;
  error?: boolean;
}): void {
  metrics.totalQueries++;
  if (options.cacheHit) metrics.cacheHits++;
  if (options.semanticSearch) metrics.semanticSearches++;
  if (options.semanticHit) metrics.semanticHits++;
  if (options.error) metrics.errors++;
  metrics.totalLatencyMs += options.latencyMs;
}

/**
 * Get current metrics
 */
export function getQueryMetrics(): DataLayerMetrics {
  return {
    cacheHitRate: metrics.totalQueries > 0 ? metrics.cacheHits / metrics.totalQueries : 0,
    avgQueryLatencyMs: metrics.totalQueries > 0 ? metrics.totalLatencyMs / metrics.totalQueries : 0,
    semanticHitRate:
      metrics.semanticSearches > 0 ? metrics.semanticHits / metrics.semanticSearches : 0,
    indexOperations: getIndexingMetrics().indexedCount,
    errorsLastHour: metrics.errors, // TODO: Track hourly window
  };
}

/**
 * Reset metrics (for testing)
 */
export function resetQueryMetrics(): void {
  metrics.totalQueries = 0;
  metrics.cacheHits = 0;
  metrics.semanticSearches = 0;
  metrics.semanticHits = 0;
  metrics.errors = 0;
  metrics.totalLatencyMs = 0;
}

// ============================================================================
// HEALTH CHECKS
// ============================================================================

/**
 * Check health of all data layer components
 */
export async function getDataLayerHealth(): Promise<DataLayerHealth> {
  const status: HealthStatus = 'healthy';
  const issues: string[] = [];

  // Check stores
  const storeHealth = {
    productivity: false,
    financial: false,
    lifeData: false,
  };

  try {
    const prodStore = getProductivityStore();
    // If we can instantiate, consider it healthy
    storeHealth.productivity = prodStore !== null;
  } catch {
    issues.push('Productivity store unavailable');
  }

  try {
    const finStore = getFinancialStore();
    storeHealth.financial = finStore !== null;
  } catch {
    issues.push('Financial store unavailable');
  }

  try {
    const lifeStore = getLifeDataStore();
    storeHealth.lifeData = lifeStore !== null;
  } catch {
    issues.push('Life data store unavailable');
  }

  // Check semantic memory
  const semanticHealth = {
    available: false,
    usingFallback: false,
  };

  try {
    const vectorStore = getFirestoreVectorStore();
    const vectorHealth = vectorStore.getHealth();
    semanticHealth.available = vectorHealth.healthy;
    semanticHealth.usingFallback = vectorHealth.usingFallback;

    if (vectorHealth.usingFallback) {
      issues.push('Vector store using in-memory fallback');
    }
  } catch {
    issues.push('Vector store unavailable');
  }

  // Get indexing metrics
  const indexingMetrics = getIndexingMetrics();

  // Determine overall status
  let finalStatus: HealthStatus = 'healthy';

  if (!storeHealth.productivity || !storeHealth.financial || !storeHealth.lifeData) {
    finalStatus = 'unhealthy';
  } else if (!semanticHealth.available || semanticHealth.usingFallback) {
    finalStatus = 'degraded';
  } else if (indexingMetrics.errorCount > 0) {
    finalStatus = 'degraded';
  }

  return {
    status: finalStatus,
    timestamp: new Date(),
    components: {
      stores: storeHealth,
      semanticMemory: semanticHealth,
      indexing: {
        pendingCount: indexingMetrics.pendingCount,
        lastFlushTime: indexingMetrics.lastFlushTime,
        errorCount: indexingMetrics.errorCount,
      },
    },
    metrics: getQueryMetrics(),
  };
}

/**
 * Quick health check (for /health endpoint)
 */
export async function isHealthy(): Promise<boolean> {
  const health = await getDataLayerHealth();
  return health.status !== 'unhealthy';
}

/**
 * Get detailed diagnostics
 */
export async function getDiagnostics(): Promise<{
  health: DataLayerHealth;
  sessions: ReturnType<typeof getSessionMetrics>;
  indexing: ReturnType<typeof getIndexingMetrics>;
  issues: string[];
  recommendations: string[];
}> {
  const health = await getDataLayerHealth();
  const sessions = getSessionMetrics();
  const indexing = getIndexingMetrics();

  const issues: string[] = [];
  const recommendations: string[] = [];

  // Analyze health
  if (health.status === 'unhealthy') {
    issues.push('One or more stores are unavailable');
    recommendations.push('Check Firestore connectivity');
  }

  if (health.components.semanticMemory.usingFallback) {
    issues.push('Semantic memory is using in-memory fallback');
    recommendations.push('Check Firestore vector store configuration');
  }

  if (indexing.pendingCount > 10) {
    issues.push(`${indexing.pendingCount} pending index operations`);
    recommendations.push('Consider flushing pending changes');
  }

  if (indexing.errorCount > 0) {
    issues.push(`${indexing.errorCount} indexing errors`);
    recommendations.push('Check embedding service availability');
  }

  if (health.metrics.cacheHitRate < 0.5 && health.metrics.avgQueryLatencyMs > 100) {
    recommendations.push('Cache hit rate is low - consider warming cache at session start');
  }

  if (health.metrics.semanticHitRate < 0.3) {
    recommendations.push('Semantic hit rate is low - may need to re-index user data');
  }

  return {
    health,
    sessions,
    indexing,
    issues,
    recommendations,
  };
}

// ============================================================================
// LOGGING
// ============================================================================

/**
 * Log health status periodically
 */
export async function logHealthStatus(): Promise<void> {
  const health = await getDataLayerHealth();

  const logLevel = health.status === 'healthy' ? 'info' : 'warn';

  log[logLevel](
    {
      status: health.status,
      stores: health.components.stores,
      semanticMemory: health.components.semanticMemory,
      pendingIndexes: health.components.indexing.pendingCount,
      cacheHitRate: health.metrics.cacheHitRate.toFixed(2),
      avgLatencyMs: health.metrics.avgQueryLatencyMs.toFixed(1),
    },
    `📊 Data Layer Health: ${health.status}`
  );
}
