/**
 * Cache Services
 *
 * Centralized caching utilities for the application.
 *
 * @module services/cache
 */

export {
  EdgeCache,
  type CacheConfig,
  type CacheEntry,
  type CacheStats,
  getPersonaBundleCache,
  cachePersonaBundle,
  getCachedPersonaBundle,
  getOrLoadPersonaBundle,
  getConfigCache,
  cacheConfig,
  getCachedConfig,
  warmCommonCaches,
} from './edge-cache.js';

