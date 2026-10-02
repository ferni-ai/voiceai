/**
 * Observability - Redis metrics
 *
 * Cache stats, pub/sub status and circuit breakers for
 * GET /api/observability/redis (routed from observability-routes.ts).
 *
 * @module api/observability-redis-metrics
 */

import { createLogger } from '../utils/safe-logger.js';

const log = createLogger({ module: 'ObservabilityAPI' });

/**
 * Get Redis metrics for cross-instance caching and messaging
 */
export async function getRedisMetrics() {
  const metrics: {
    connected: boolean;
    caches: Array<{ name: string; stats: Record<string, unknown> }>;
    pubsub: { enabled: boolean; channels: string[] };
    circuitBreakers: Array<{ name: string; state: string; failures: number }>;
    timestamp: string;
  } = {
    connected: false,
    caches: [],
    pubsub: { enabled: false, channels: [] },
    circuitBreakers: [],
    timestamp: new Date().toISOString(),
  };

  try {
    // Check Redis connection
    const { getRedisCache } = await import('../memory/redis-cache.js');
    const redisCache = getRedisCache();
    metrics.connected = redisCache.isConnected();

    // Get cache stats from ManagedCache registry
    const { getAllCacheStats } = await import('../services/data-layer/memory-cache-manager.js');
    const cacheStats = getAllCacheStats();
    metrics.caches = Object.entries(cacheStats).map(([name, s]) => ({
      name,
      stats: {
        entries: s.entries,
        hits: s.hits,
        misses: s.misses,
        hitRate:
          s.hits + s.misses > 0 ? `${((s.hits / (s.hits + s.misses)) * 100).toFixed(1)}%` : 'N/A',
        evictions: s.evictions,
        estimatedSizeBytes: s.estimatedSizeBytes,
      },
    }));

    // Get Pub/Sub status
    try {
      const { getRedisPubSub, CHANNELS } = await import('../services/redis-pubsub.js');
      const pubsub = getRedisPubSub();
      metrics.pubsub = {
        enabled: pubsub.isAvailable(),
        channels: Object.values(CHANNELS),
      };
    } catch {
      // Pub/Sub not available
    }

    // Get Redis circuit breaker stats
    try {
      const { getAllRedisCircuitStats } =
        await import('../services/self-healing/redis-circuit-breaker.js');
      const circuitStats = getAllRedisCircuitStats();
      metrics.circuitBreakers = circuitStats.map((s) => ({
        name: s.name,
        state: s.state,
        failures: s.failures,
      }));
    } catch {
      // Redis circuit breakers not available
    }

    // Get persona insights cache stats
    try {
      const { getInsightsCacheStats } =
        await import('../intelligence/context-builders/persona-insights-cache.js');
      const insightsStats = getInsightsCacheStats();
      metrics.caches.push({
        name: 'persona-insights',
        stats: {
          totalSessions: insightsStats.totalSessions,
          totalEntries: insightsStats.totalEntries,
          pendingRefreshes: insightsStats.pendingRefreshes,
          redisL2Enabled: insightsStats.redisL2Enabled,
        },
      });
    } catch {
      // Persona insights cache not available
    }

    // Get semantic router cache stats
    try {
      const { getSemanticRouterCache } =
        await import('../tools/semantic-router/integration/redis-cache.js');
      const routerCache = getSemanticRouterCache();
      const routerStats = routerCache.getStats();
      metrics.caches.push({
        name: 'semantic-router',
        stats: { ...routerStats }, // Spread to convert to plain object
      });
    } catch {
      // Semantic router cache not available
    }
  } catch (error) {
    log.debug({ error: String(error) }, 'Error getting Redis metrics');
  }

  return metrics;
}
