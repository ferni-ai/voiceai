/**
 * LRU (Least Recently Used) Cache
 *
 * A simple LRU cache implementation to prevent memory leaks in user-scoped singletons.
 * When the cache reaches capacity, the least recently used item is evicted.
 *
 * Usage:
 * ```typescript
 * const cache = new LRUCache<string, UserEngine>(100); // Max 100 users
 * cache.set(userId, engine);
 * const engine = cache.get(userId); // Also marks as recently used
 * ```
 */

export class LRUCache<K, V> {
  private cache = new Map<K, V>();
  private readonly maxSize: number;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  /**
   * Get a value from the cache.
   * Returns undefined if not found.
   * Marks the key as recently used.
   */
  get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  /**
   * Set a value in the cache.
   * If at capacity, evicts the least recently used item.
   */
  set(key: K, value: V): void {
    // If key exists, delete it first (to update position)
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Evict least recently used (first item in Map)
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(key, value);
  }

  /**
   * Check if key exists in cache
   */
  has(key: K): boolean {
    return this.cache.has(key);
  }

  /**
   * Delete a specific key from cache
   */
  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get current size
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Get all values (for iteration/persistence)
   */
  values(): IterableIterator<V> {
    return this.cache.values();
  }

  /**
   * Get all entries (for iteration/persistence)
   */
  entries(): IterableIterator<[K, V]> {
    return this.cache.entries();
  }

  /**
   * Get all keys
   */
  keys(): IterableIterator<K> {
    return this.cache.keys();
  }
}

/**
 * Default cache sizes for different intelligence modules
 */
export const CACHE_SIZES = {
  /** User-scoped engines (ProactiveInsight, CrossSessionThreader, etc.) */
  USER_ENGINES: 500,

  /** Response quality trackers per user */
  RESPONSE_TRACKERS: 500,

  /** Conversation pattern analyzers per user */
  PATTERN_ANALYZERS: 500,

  /** Voice pace adapters per user */
  PACE_ADAPTERS: 500,

  /** Humor calibration per user */
  HUMOR_CALIBRATION: 500,

  /** Story preference per user */
  STORY_PREFERENCE: 500,

  /** Communication mirroring per user */
  COMMUNICATION_MIRRORING: 500,

  /** Emotional memory per user */
  EMOTIONAL_MEMORY: 500,

  /** Financial journey trackers per user */
  FINANCIAL_JOURNEY: 500,
} as const;

export default LRUCache;
