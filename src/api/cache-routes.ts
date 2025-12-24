/**
 * Cache Management API Routes
 *
 * Admin endpoints for cache debugging and management.
 *
 * Endpoints:
 * - GET /api/debug/cache/stats - Get cache statistics
 * - GET /api/debug/cache/embedding - Get embedding cache stats
 * - POST /api/debug/cache/clear - Clear specific cache
 * - GET /api/debug/cache/health - Cache health check
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../utils/safe-logger.js';
import {
  handleCorsPreflightIfNeeded,
  sendJSON,
  sendError,
  parseBody,
} from './helpers.js';
import { requireAdmin } from './auth-middleware.js';
import { getEmbeddingCache } from '../memory/embedding-cache.js';

const log = createLogger({ module: 'CacheAPI' });

interface ClearCacheRequest {
  cacheType: 'embedding' | 'redis' | 'speculative' | 'all';
}

/**
 * Handle cache management routes
 */
export async function handleCacheRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  // Only handle /api/debug/cache/* routes
  if (!pathname.startsWith('/api/debug/cache')) {
    return false;
  }

  // Handle CORS preflight
  if (handleCorsPreflightIfNeeded(req, res)) {
    return true;
  }

  // Require admin for all cache routes
  const auth = await requireAdmin(req, res);
  if (!auth) return true;

  try {
    // GET /api/debug/cache/stats - Get all cache statistics
    if (pathname === '/api/debug/cache/stats' && req.method === 'GET') {
      const stats = await getCacheStats();
      sendJSON(res, stats);
      log.debug({ userId: auth.userId }, 'Cache stats fetched');
      return true;
    }

    // GET /api/debug/cache/embedding - Get embedding cache stats
    if (pathname === '/api/debug/cache/embedding' && req.method === 'GET') {
      const embeddingCache = getEmbeddingCache();
      const stats = embeddingCache.getStats();

      sendJSON(res, {
        ...stats,
        hitRate: stats.hits / Math.max(stats.hits + stats.misses, 1),
        avgLookupTimeMs: stats.avgLookupTimeMs,
      });
      return true;
    }

    // GET /api/debug/cache/health - Cache health check
    if (pathname === '/api/debug/cache/health' && req.method === 'GET') {
      const health = await getCacheHealth();
      sendJSON(res, health);
      return true;
    }

    // POST /api/debug/cache/clear - Clear specific cache
    if (pathname === '/api/debug/cache/clear' && req.method === 'POST') {
      const body = await parseBody<ClearCacheRequest>(req);

      if (!body?.cacheType) {
        sendError(res, 'cacheType is required', 400);
        return true;
      }

      const result = await clearCache(body.cacheType);

      log.info({ userId: auth.userId, cacheType: body.cacheType }, 'Cache cleared');
      sendJSON(res, result);
      return true;
    }

    // Unknown cache route
    sendError(res, 'Cache endpoint not found', 404);
    return true;
  } catch (err) {
    log.error({ error: String(err) }, 'Cache route error');
    sendError(res, 'Internal error', 500);
    return true;
  }
}

/**
 * Get statistics for all caches
 */
async function getCacheStats(): Promise<Record<string, unknown>> {
  const stats: Record<string, unknown> = {};

  // Embedding cache
  try {
    const embeddingCache = getEmbeddingCache();
    const embeddingStats = embeddingCache.getStats();
    stats.embedding = {
      size: embeddingStats.size,
      hits: embeddingStats.hits,
      misses: embeddingStats.misses,
      hitRate: embeddingStats.hits / Math.max(embeddingStats.hits + embeddingStats.misses, 1),
      avgLookupTimeMs: embeddingStats.avgLookupTimeMs,
    };
  } catch {
    stats.embedding = { error: 'Not available' };
  }

  // Redis cache (if available)
  try {
    const { getRedisCache } = await import('../memory/redis-cache.js');
    const redisCache = getRedisCache();
    const redisStats = await redisCache.getStats?.();
    if (redisStats) {
      stats.redis = redisStats;
    } else {
      stats.redis = { status: 'available', detailedStatsNotAvailable: true };
    }
  } catch {
    stats.redis = { error: 'Not configured or not available' };
  }

  // Speculative embeddings (if available)
  try {
    const { getSpeculativeStats } = await import('../memory/speculative-embeddings.js');
    stats.speculative = getSpeculativeStats();
  } catch {
    stats.speculative = { error: 'Not available' };
  }

  // Vector store stats
  try {
    const { getFirestoreVectorStore } = await import('../memory/firestore-vector-store.js');
    const vectorStore = getFirestoreVectorStore();
    const vectorStats = await vectorStore.getStats();
    stats.vectorStore = vectorStats;
  } catch {
    stats.vectorStore = { error: 'Not available' };
  }

  return stats;
}

/**
 * Get cache health status
 */
async function getCacheHealth(): Promise<Record<string, unknown>> {
  const health: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    status: 'healthy',
    caches: {},
  };

  // Embedding cache health
  try {
    const embeddingCache = getEmbeddingCache();
    const stats = embeddingCache.getStats();
    const hitRate = stats.hits / Math.max(stats.hits + stats.misses, 1);

    (health.caches as Record<string, unknown>).embedding = {
      status: hitRate > 0.5 ? 'healthy' : hitRate > 0.2 ? 'degraded' : 'cold',
      hitRate,
      size: stats.size,
    };
  } catch {
    (health.caches as Record<string, unknown>).embedding = { status: 'unavailable' };
  }

  // Redis health
  try {
    const { getRedisCache } = await import('../memory/redis-cache.js');
    const redisCache = getRedisCache();
    const isConnected = await redisCache.ping?.();

    (health.caches as Record<string, unknown>).redis = {
      status: isConnected ? 'healthy' : 'disconnected',
    };
  } catch {
    (health.caches as Record<string, unknown>).redis = { status: 'not_configured' };
  }

  // Determine overall status
  const cacheStatuses = Object.values(health.caches as Record<string, { status: string }>);
  if (cacheStatuses.some((c) => c.status === 'unavailable' || c.status === 'disconnected')) {
    health.status = 'degraded';
  }

  return health;
}

/**
 * Clear a specific cache
 */
async function clearCache(
  cacheType: 'embedding' | 'redis' | 'speculative' | 'all'
): Promise<{ cleared: string[]; errors: string[] }> {
  const cleared: string[] = [];
  const errors: string[] = [];

  if (cacheType === 'embedding' || cacheType === 'all') {
    try {
      const { resetEmbeddingCache } = await import('../memory/embedding-cache.js');
      resetEmbeddingCache();
      cleared.push('embedding');
    } catch (err) {
      errors.push(`embedding: ${String(err)}`);
    }
  }

  if (cacheType === 'redis' || cacheType === 'all') {
    try {
      const { getRedisCache } = await import('../memory/redis-cache.js');
      const redisCache = getRedisCache();
      await redisCache.clear?.();
      cleared.push('redis');
    } catch (err) {
      errors.push(`redis: ${String(err)}`);
    }
  }

  if (cacheType === 'speculative' || cacheType === 'all') {
    try {
      const { resetSpeculativeEmbeddings } = await import('../memory/speculative-embeddings.js');
      resetSpeculativeEmbeddings();
      cleared.push('speculative');
    } catch (err) {
      errors.push(`speculative: ${String(err)}`);
    }
  }

  return { cleared, errors };
}
