/**
 * Cache Monitoring Service
 *
 * Unified monitoring for all caching systems in the application.
 * Provides centralized statistics, health checks, and diagnostics.
 *
 * Caches monitored:
 * - Persona content loader (behaviors, content)
 * - Context builder output
 * - Context builder registry
 * - Cognitive style detection
 * - Embedding cache
 * - Redis session cache
 *
 * @module services/cache-monitoring
 */

import { createLogger } from '../../utils/safe-logger.js';
import { registerInterval, clearNamedInterval, hasInterval } from '../../utils/interval-manager.js';
import { getContentCacheStats, pruneExpiredContent } from './persona-content-loader.js';
import {
  getContextOutputCacheStats,
  getRegistryStats,
} from '../../intelligence/context-builders/index.js';
import { getCognitiveStyleCacheStats } from '../../personas/cognitive-advanced.js';
import { getEmbeddingCache } from '../../memory/embedding-cache.js';
import { getRedisCache } from '../../memory/redis-cache.js';

const log = createLogger({ module: 'cache-monitoring' });

// ============================================================================
// TYPES
// ============================================================================

export interface CacheStats {
  size: number;
  hits: number;
  misses: number;
  evictions: number;
  hitRate: number;
}

export interface CacheHealthStatus {
  name: string;
  healthy: boolean;
  size: number;
  hitRate: number;
  issues: string[];
}

export interface CacheMonitoringSnapshot {
  timestamp: Date;
  caches: {
    personaBehaviors: CacheStats;
    personaContent: CacheStats;
    contextOutput: CacheStats;
    contextRegistry: {
      totalBuilders: number;
      byCategory: Record<string, number>;
      cacheStatus: { sortedAll: boolean; sortedByCategory: number };
    };
    cognitiveStyle: CacheStats;
    embeddings: CacheStats;
    redis: {
      connected: boolean;
    };
  };
  totals: {
    totalCacheEntries: number;
    overallHitRate: number;
    totalEvictions: number;
  };
  health: CacheHealthStatus[];
}

// ============================================================================
// MONITORING FUNCTIONS
// ============================================================================

/**
 * Get complete cache monitoring snapshot
 */
export function getCacheMonitoringSnapshot(): CacheMonitoringSnapshot {
  // Get stats from all cache systems
  const contentCacheStats = getContentCacheStats();
  const contextOutputStats = getContextOutputCacheStats();
  const registryStats = getRegistryStats();
  const cognitiveStats = getCognitiveStyleCacheStats();
  const embeddingCache = getEmbeddingCache();
  const embeddingStats = embeddingCache.getStats();
  const redis = getRedisCache();

  // Calculate totals
  const allStats = [
    contentCacheStats.behaviors,
    contentCacheStats.content,
    contextOutputStats,
    cognitiveStats,
    embeddingStats,
  ];

  const totalEntries = allStats.reduce((sum, s) => sum + s.size, 0);
  const totalHits = allStats.reduce((sum, s) => sum + s.hits, 0);
  const totalMisses = allStats.reduce((sum, s) => sum + s.misses, 0);
  const totalEvictions = allStats.reduce((sum, s) => sum + s.evictions, 0);
  const overallHitRate = totalHits + totalMisses > 0 ? totalHits / (totalHits + totalMisses) : 0;

  // Build health status
  const health: CacheHealthStatus[] = [
    buildHealthStatus('Persona Behaviors', contentCacheStats.behaviors),
    buildHealthStatus('Persona Content', contentCacheStats.content),
    buildHealthStatus('Context Output', contextOutputStats),
    buildHealthStatus('Cognitive Style', cognitiveStats),
    buildHealthStatus('Embeddings', embeddingStats),
  ];

  return {
    timestamp: new Date(),
    caches: {
      personaBehaviors: contentCacheStats.behaviors,
      personaContent: contentCacheStats.content,
      contextOutput: contextOutputStats,
      contextRegistry: registryStats,
      cognitiveStyle: cognitiveStats,
      embeddings: embeddingStats,
      redis: {
        connected: redis.isConnected(),
      },
    },
    totals: {
      totalCacheEntries: totalEntries,
      overallHitRate,
      totalEvictions,
    },
    health,
  };
}

/**
 * Build health status for a cache
 */
function buildHealthStatus(name: string, stats: CacheStats): CacheHealthStatus {
  const issues: string[] = [];
  let healthy = true;

  // Check hit rate (low hit rate may indicate issue)
  if (stats.hits + stats.misses > 100 && stats.hitRate < 0.3) {
    issues.push(`Low hit rate: ${(stats.hitRate * 100).toFixed(1)}%`);
    healthy = false;
  }

  // Check for excessive evictions
  if (stats.evictions > stats.hits * 2) {
    issues.push(`High eviction rate: ${stats.evictions} evictions vs ${stats.hits} hits`);
    healthy = false;
  }

  return {
    name,
    healthy,
    size: stats.size,
    hitRate: stats.hitRate,
    issues,
  };
}

/**
 * Get a summary report for logging
 */
export function getCacheSummaryReport(): string {
  const snapshot = getCacheMonitoringSnapshot();
  const lines: string[] = [
    '=== Cache Monitoring Report ===',
    `Timestamp: ${snapshot.timestamp.toISOString()}`,
    '',
    '--- Cache Statistics ---',
    `Total Entries: ${snapshot.totals.totalCacheEntries}`,
    `Overall Hit Rate: ${(snapshot.totals.overallHitRate * 100).toFixed(1)}%`,
    `Total Evictions: ${snapshot.totals.totalEvictions}`,
    '',
    '--- Per-Cache Breakdown ---',
  ];

  for (const health of snapshot.health) {
    const status = health.healthy ? '✓' : '⚠';
    lines.push(
      `${status} ${health.name}: ${health.size} entries, ${(health.hitRate * 100).toFixed(1)}% hit rate`
    );
    if (health.issues.length > 0) {
      for (const issue of health.issues) {
        lines.push(`    - ${issue}`);
      }
    }
  }

  lines.push('');
  lines.push(`Context Builders: ${snapshot.caches.contextRegistry.totalBuilders} registered`);
  lines.push(`Redis: ${snapshot.caches.redis.connected ? 'Connected' : 'Not connected'}`);

  return lines.join('\n');
}

/**
 * Run cache maintenance (prune expired entries)
 */
export function runCacheMaintenance(): {
  pruned: { behaviors: number; content: number };
  embeddings: number;
} {
  log.info('Running cache maintenance...');

  // Prune persona content cache
  const contentPruned = pruneExpiredContent();

  // Prune embedding cache
  const embeddingCache = getEmbeddingCache();
  const embeddingsPruned = embeddingCache.pruneExpired();

  log.info(
    {
      behaviorsPruned: contentPruned.behaviors,
      contentPruned: contentPruned.content,
      embeddingsPruned,
    },
    'Cache maintenance completed'
  );

  return {
    pruned: contentPruned,
    embeddings: embeddingsPruned,
  };
}

/**
 * Check if any caches have health issues
 */
export function checkCacheHealth(): { healthy: boolean; issues: string[] } {
  const snapshot = getCacheMonitoringSnapshot();
  const allIssues: string[] = [];

  for (const health of snapshot.health) {
    for (const issue of health.issues) {
      allIssues.push(`${health.name}: ${issue}`);
    }
  }

  return {
    healthy: allIssues.length === 0,
    issues: allIssues,
  };
}

/**
 * Log current cache status
 */
export function logCacheStatus(): void {
  const report = getCacheSummaryReport();
  log.info(report);
}

// ============================================================================
// PERIODIC MAINTENANCE
// ============================================================================

const CACHE_MAINTENANCE_INTERVAL = 'cache-maintenance';

/**
 * Start periodic cache maintenance (every 15 minutes)
 */
export function startCacheMaintenance(intervalMs = 15 * 60 * 1000): void {
  if (hasInterval(CACHE_MAINTENANCE_INTERVAL)) {
    return;
  }

  registerInterval(
    CACHE_MAINTENANCE_INTERVAL,
    () => {
      try {
        runCacheMaintenance();
      } catch (error) {
        log.error({ error: String(error) }, 'Cache maintenance failed');
      }
    },
    intervalMs
  );

  log.info({ intervalMs }, 'Cache maintenance started');
}

/**
 * Stop periodic cache maintenance
 */
export function stopCacheMaintenance(): void {
  clearNamedInterval(CACHE_MAINTENANCE_INTERVAL);
  log.info('Cache maintenance stopped');
}

export default {
  getCacheMonitoringSnapshot,
  getCacheSummaryReport,
  runCacheMaintenance,
  checkCacheHealth,
  logCacheStatus,
  startCacheMaintenance,
  stopCacheMaintenance,
};
