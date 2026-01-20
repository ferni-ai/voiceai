/**
 * Cache implementation for Unified Data Service
 *
 * @module services/ceo/unified-data/cache
 */

import type { CacheStats } from './types.js';

// ============================================================================
// CACHE CONFIGURATION
// ============================================================================

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

export const CACHE_TTL = {
  METRICS: 5 * 60 * 1000, // 5 minutes for metrics
  USER_DATA: 2 * 60 * 1000, // 2 minutes for user data
  BUSINESS_DATA: 10 * 60 * 1000, // 10 minutes for business data
};

// ============================================================================
// CACHE IMPLEMENTATION
// ============================================================================

class DataCache {
  private cache = new Map<string, CacheEntry<unknown>>();
  private hits = 0;
  private misses = 0;

  get<T>(key: string): T | null {
    const entry = this.cache.get(key) as CacheEntry<T> | undefined;
    if (!entry) {
      this.misses++;
      return null;
    }

    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      this.misses++;
      return null;
    }

    this.hits++;
    return entry.data;
  }

  set<T>(key: string, data: T, ttl: number): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl,
    });
  }

  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  getStats(): CacheStats {
    return {
      hits: this.hits,
      misses: this.misses,
      size: this.cache.size,
    };
  }
}

export const dataCache = new DataCache();
