/**
 * Redis Adapter for Unified Memory Store
 *
 * Provides caching layer for fast memory retrieval.
 * Wraps the existing redis-cache.ts implementation.
 *
 * @module memory/unified-store/adapters/redis-adapter
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type {
  CacheStoreAdapter,
  StoredMemory,
  SearchParams,
  ScoredMemory,
  StoreHealth,
} from '../types.js';

const log = createLogger({ module: 'RedisAdapter' });

// ============================================================================
// TYPES
// ============================================================================

interface RedisAdapterConfig {
  /** Redis connection URL */
  url?: string;
  /** Default TTL in seconds */
  defaultTtl?: number;
  /** Key prefix */
  keyPrefix?: string;
  /** Enable/disable Redis (for environments without Redis) */
  enabled?: boolean;
}

interface RedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options?: { EX?: number }): Promise<unknown>;
  del(key: string | string[]): Promise<number>;
  keys(pattern: string): Promise<string[]>;
  ttl(key: string): Promise<number>;
  quit(): Promise<void>;
  ping(): Promise<string>;
}

// ============================================================================
// REDIS ADAPTER
// ============================================================================

/**
 * Redis adapter for caching in the unified memory store
 *
 * Provides fast read/write with TTL-based expiration.
 * Falls back gracefully when Redis is unavailable.
 */
export class RedisAdapter implements CacheStoreAdapter {
  readonly name = 'redis';

  private client: RedisClient | null = null;
  private config: RedisAdapterConfig;
  private initialized = false;
  private initPromise: Promise<void> | null = null;
  private usingFallback = false;

  // In-memory fallback when Redis unavailable
  private fallbackCache = new Map<string, { value: string; expiresAt: number }>();

  // Metrics
  private hits = 0;
  private misses = 0;
  private successCount = 0;
  private errorCount = 0;
  private lastError: string | undefined;
  private lastSuccess: Date | undefined;
  private avgLatencyMs = 0;
  private latencyCount = 0;

  constructor(config?: RedisAdapterConfig) {
    this.config = {
      url: config?.url || process.env.REDIS_URL,
      defaultTtl: config?.defaultTtl || 3600, // 1 hour
      keyPrefix: config?.keyPrefix || 'unified_memory:',
      enabled: config?.enabled ?? (!!process.env.REDIS_URL),
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INITIALIZATION
  // ═══════════════════════════════════════════════════════════════════════════

  async initialize(): Promise<void> {
    if (this.initialized) return;

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this.doInitialize();

    try {
      await this.initPromise;
    } catch (error) {
      this.initPromise = null;
      throw error;
    }
  }

  private async doInitialize(): Promise<void> {
    if (!this.config.enabled || !this.config.url) {
      log.info('Redis disabled or no URL provided, using in-memory fallback');
      this.usingFallback = true;
      this.initialized = true;
      return;
    }

    try {
      // Dynamic import of redis (optional dependency)
      let redis: { createClient: (options: { url: string | undefined }) => unknown } | null = null;
      try {
        // @ts-expect-error - redis is an optional dependency
        redis = await import('redis');
      } catch {
        log.warn('Redis module not available, using fallback');
        this.usingFallback = true;
        this.initialized = true;
        return;
      }

      if (!redis) {
        this.usingFallback = true;
        this.initialized = true;
        return;
      }

      this.client = redis.createClient({ url: this.config.url }) as unknown as RedisClient;

      await (this.client as unknown as { connect: () => Promise<void> }).connect();
      await this.client.ping();

      this.initialized = true;
      log.info('Redis adapter initialized');
    } catch (error) {
      log.warn({ error: String(error) }, 'Failed to connect to Redis, using fallback');
      this.usingFallback = true;
      this.initialized = true;
    }
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CORE OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  async store(memory: StoredMemory): Promise<void> {
    await this.ensureInitialized();
    const startTime = Date.now();

    try {
      const key = this.buildKey(memory.userId, memory.id);
      const value = JSON.stringify(memory);

      await this.setWithTTL(key, memory, this.config.defaultTtl!);

      this.recordSuccess(Date.now() - startTime);
    } catch (error) {
      this.recordError(error);
      throw error;
    }
  }

  async get(userId: string, memoryId: string): Promise<StoredMemory | null> {
    await this.ensureInitialized();
    const startTime = Date.now();

    try {
      const key = this.buildKey(userId, memoryId);
      const result = await this.getWithTTL(key);

      if (result.value) {
        this.hits++;
      } else {
        this.misses++;
      }

      this.recordSuccess(Date.now() - startTime);
      return result.value;
    } catch (error) {
      this.recordError(error);
      throw error;
    }
  }

  async update(userId: string, memoryId: string, updates: Partial<StoredMemory>): Promise<void> {
    await this.ensureInitialized();

    // Get existing, merge updates, store back
    const existing = await this.get(userId, memoryId);
    if (existing) {
      const updated = { ...existing, ...updates, updatedAt: new Date() };
      await this.store(updated);
    }
  }

  async delete(userId: string, memoryId: string): Promise<void> {
    await this.ensureInitialized();
    const startTime = Date.now();

    try {
      const key = this.buildKey(userId, memoryId);

      if (this.usingFallback) {
        this.fallbackCache.delete(key);
      } else {
        await this.client!.del(key);
      }

      this.recordSuccess(Date.now() - startTime);
    } catch (error) {
      this.recordError(error);
      throw error;
    }
  }

  async search(_params: SearchParams): Promise<ScoredMemory[]> {
    // Redis is not suitable for complex searches
    // Return empty - facade should use Firestore/Vector for search
    return [];
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CACHE-SPECIFIC OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  async getWithTTL(key: string): Promise<{ value: StoredMemory | null; ttl: number }> {
    await this.ensureInitialized();

    if (this.usingFallback) {
      const entry = this.fallbackCache.get(key);
      if (!entry) {
        return { value: null, ttl: 0 };
      }

      const now = Date.now();
      if (entry.expiresAt <= now) {
        this.fallbackCache.delete(key);
        return { value: null, ttl: 0 };
      }

      const ttl = Math.floor((entry.expiresAt - now) / 1000);
      return { value: JSON.parse(entry.value), ttl };
    }

    const value = await this.client!.get(key);
    if (!value) {
      return { value: null, ttl: 0 };
    }

    const ttl = await this.client!.ttl(key);
    return { value: JSON.parse(value), ttl };
  }

  async setWithTTL(key: string, value: StoredMemory, ttlSeconds: number): Promise<void> {
    await this.ensureInitialized();

    const serialized = JSON.stringify(value);

    if (this.usingFallback) {
      this.fallbackCache.set(key, {
        value: serialized,
        expiresAt: Date.now() + ttlSeconds * 1000,
      });
      return;
    }

    await this.client!.set(key, serialized, { EX: ttlSeconds });
  }

  async invalidate(pattern: string): Promise<number> {
    await this.ensureInitialized();

    if (this.usingFallback) {
      let count = 0;
      const regex = new RegExp(pattern.replace('*', '.*'));
      for (const key of this.fallbackCache.keys()) {
        if (regex.test(key)) {
          this.fallbackCache.delete(key);
          count++;
        }
      }
      return count;
    }

    const keys = await this.client!.keys(pattern);
    if (keys.length === 0) return 0;

    return this.client!.del(keys);
  }

  async getCacheStats(): Promise<{ hits: number; misses: number; size: number }> {
    await this.ensureInitialized();

    return {
      hits: this.hits,
      misses: this.misses,
      size: this.usingFallback ? this.fallbackCache.size : 0, // Can't get size from Redis easily
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HEALTH & MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  async health(): Promise<StoreHealth> {
    const totalOps = this.successCount + this.errorCount;
    const errorRate = totalOps > 0 ? this.errorCount / totalOps : 0;

    let healthy = this.initialized;
    if (!this.usingFallback && this.client) {
      try {
        await this.client.ping();
      } catch {
        healthy = false;
      }
    }

    return {
      healthy: healthy && errorRate < 0.1,
      name: this.name + (this.usingFallback ? ' (fallback)' : ''),
      initialized: this.initialized,
      latencyMs: this.avgLatencyMs,
      errorRate,
      lastError: this.lastError,
      lastSuccess: this.lastSuccess,
    };
  }

  async shutdown(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.client = null;
    }
    this.fallbackCache.clear();
    this.initialized = false;
    log.info('Redis adapter shut down');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  private buildKey(userId: string, memoryId: string): string {
    return `${this.config.keyPrefix}${userId}:${memoryId}`;
  }

  private recordSuccess(latencyMs: number): void {
    this.successCount++;
    this.lastSuccess = new Date();

    this.latencyCount++;
    this.avgLatencyMs = this.avgLatencyMs + (latencyMs - this.avgLatencyMs) / this.latencyCount;
  }

  private recordError(error: unknown): void {
    this.errorCount++;
    this.lastError = String(error);
    log.error({ error: String(error) }, 'Redis adapter error');
  }
}

// ============================================================================
// FACTORY
// ============================================================================

let instance: RedisAdapter | null = null;

/**
 * Get or create the Redis adapter singleton
 */
export function getRedisAdapter(config?: RedisAdapterConfig): RedisAdapter {
  if (!instance) {
    instance = new RedisAdapter(config);
  }
  return instance;
}

/**
 * Reset the singleton (for testing)
 */
export function resetRedisAdapter(): void {
  instance = null;
}
