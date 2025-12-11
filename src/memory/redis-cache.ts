/**
 * Redis Cache Layer
 *
 * Fast, ephemeral caching for session data using Redis.
 * Works with Google Cloud Memorystore for Redis in production.
 *
 * GRACEFUL DEGRADATION:
 * All cache operations fail silently and return sensible defaults when Redis
 * is unavailable. This ensures the application continues working without cache.
 *
 * Requires: npm install ioredis
 *
 * Environment:
 * - REDIS_URL: Redis connection string (e.g., redis://localhost:6379)
 * - REDIS_HOST: Redis host (alternative to URL)
 * - REDIS_PORT: Redis port (default: 6379)
 * - REDIS_PASSWORD: Redis password (if required)
 */

import { gzip, gunzip } from 'zlib';
import { promisify } from 'util';
import { getLogger } from '../utils/safe-logger.js';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

/**
 * Session cache data structure
 */
type SessionCacheData = Record<string, unknown>;

// ============================================================================
// TYPES
// ============================================================================

interface RedisConfig {
  url?: string;
  host?: string;
  port?: number;
  password?: string;
  db?: number;
  keyPrefix?: string;
  maxRetriesPerRequest?: number;
  enableReadyCheck?: boolean;
  connectTimeout?: number;
}

interface RedisClient {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string, mode?: string, duration?: number) => Promise<string | null>;
  setex: (key: string, seconds: number, value: string) => Promise<string>;
  del: (key: string | string[]) => Promise<number>;
  exists: (key: string) => Promise<number>;
  expire: (key: string, seconds: number) => Promise<number>;
  ttl: (key: string) => Promise<number>;
  keys: (pattern: string) => Promise<string[]>;
  incr: (key: string) => Promise<number>;
  hset: (key: string, field: string, value: string) => Promise<number>;
  hget: (key: string, field: string) => Promise<string | null>;
  hgetall: (key: string) => Promise<Record<string, string>>;
  hdel: (key: string, field: string) => Promise<number>;
  lpush: (key: string, ...values: string[]) => Promise<number>;
  rpush: (key: string, ...values: string[]) => Promise<number>;
  lrange: (key: string, start: number, stop: number) => Promise<string[]>;
  ltrim: (key: string, start: number, stop: number) => Promise<string>;
  quit: () => Promise<string>;
  ping: () => Promise<string>;
}

// ============================================================================
// REDIS CACHE
// ============================================================================

/**
 * Redis-based cache for session data
 *
 * Key patterns:
 * - session:{sessionId} - Session data (JSON)
 * - session:{sessionId}:turns - Conversation turns (list)
 * - session:{sessionId}:analysis - Latest analysis (JSON)
 * - user:{userId}:session - Current session ID
 * - rate:{userId} - Rate limiting counter
 */
export class RedisCache {
  private client: RedisClient | null = null;
  private config: RedisConfig;
  private initialized = false;
  // FIX: Cache initialization promise to prevent race conditions
  private initPromise: Promise<void> | null = null;

  // Default TTLs
  private readonly SESSION_TTL = 3600; // 1 hour
  private readonly ANALYSIS_TTL = 300; // 5 minutes
  private readonly RATE_TTL = 60; // 1 minute

  constructor(config?: RedisConfig) {
    this.config = config || {
      url: process.env.REDIS_URL,
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD,
      keyPrefix: 'bogle:',
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      connectTimeout: 10000,
    };
  }

  /**
   * Initialize Redis connection
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Return cached promise if initialization is in progress
    if (this.initPromise) {
      return this.initPromise;
    }

    // Start initialization and cache the promise
    this.initPromise = this.doInitialize();

    try {
      await this.initPromise;
    } finally {
      this.initPromise = null;
    }
  }

  private async doInitialize(): Promise<void> {
    try {
      // Dynamic import of ioredis
      const Redis = (await import('ioredis')).default;

      if (this.config.url) {
        this.client = new Redis(this.config.url, {
          keyPrefix: this.config.keyPrefix,
          maxRetriesPerRequest: this.config.maxRetriesPerRequest,
          enableReadyCheck: this.config.enableReadyCheck,
        }) as unknown as RedisClient;
      } else {
        this.client = new Redis({
          host: this.config.host,
          port: this.config.port,
          password: this.config.password,
          db: this.config.db,
          keyPrefix: this.config.keyPrefix,
          maxRetriesPerRequest: this.config.maxRetriesPerRequest,
          enableReadyCheck: this.config.enableReadyCheck,
        }) as unknown as RedisClient;
      }

      // Test connection
      await this.client.ping();

      this.initialized = true;
      getLogger().info('Redis cache initialized successfully');
    } catch (error) {
      getLogger().error(`Redis initialization failed: ${error}`);
      throw error;
    }
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.initialized && this.client !== null;
  }

  // ============================================================================
  // SESSION MANAGEMENT
  // ============================================================================

  /**
   * Store session data
   * Fails silently if Redis unavailable - cache is optional
   */
  async setSession(
    sessionId: string,
    data: SessionCacheData,
    ttlSeconds?: number
  ): Promise<boolean> {
    if (!this.client) {
      getLogger().debug('Redis unavailable, skipping session cache');
      return false;
    }

    try {
      const key = `session:${sessionId}`;
      const value = JSON.stringify(data);

      await this.client.setex(key, ttlSeconds || this.SESSION_TTL, value);
      getLogger().debug(`Cached session: ${sessionId}`);
      return true;
    } catch (error) {
      getLogger().warn(
        { error: String(error), sessionId },
        'Failed to cache session (non-blocking)'
      );
      return false;
    }
  }

  /**
   * Get session data
   * Returns null if Redis unavailable or error - caller handles cache miss
   */
  async getSession(sessionId: string): Promise<SessionCacheData | null> {
    if (!this.client) {
      return null;
    }

    try {
      const key = `session:${sessionId}`;
      const value = await this.client.get(key);

      if (!value) return null;

      return JSON.parse(value);
    } catch (error) {
      getLogger().warn(
        { error: String(error), sessionId },
        'Failed to get cached session (non-blocking)'
      );
      return null;
    }
  }

  /**
   * Delete session data
   * Fails silently if Redis unavailable
   */
  async deleteSession(sessionId: string): Promise<boolean> {
    if (!this.client) {
      return false;
    }

    try {
      const keys = await this.client.keys(`session:${sessionId}*`);
      if (keys.length > 0) {
        await this.client.del(keys);
      }

      getLogger().debug(`Deleted session: ${sessionId}`);
      return true;
    } catch (error) {
      getLogger().warn(
        { error: String(error), sessionId },
        'Failed to delete session (non-blocking)'
      );
      return false;
    }
  }

  /**
   * Extend session TTL
   * Fails silently if Redis unavailable
   */
  async extendSession(sessionId: string, ttlSeconds?: number): Promise<boolean> {
    if (!this.client) {
      return false;
    }

    try {
      const key = `session:${sessionId}`;
      await this.client.expire(key, ttlSeconds || this.SESSION_TTL);
      return true;
    } catch (error) {
      getLogger().warn(
        { error: String(error), sessionId },
        'Failed to extend session TTL (non-blocking)'
      );
      return false;
    }
  }

  // ============================================================================
  // CONVERSATION TURNS
  // ============================================================================

  /**
   * Add a conversation turn
   * Fails silently if Redis unavailable
   */
  async addTurn(
    sessionId: string,
    turn: { role: string; content: string; timestamp: Date }
  ): Promise<boolean> {
    if (!this.client) {
      return false;
    }

    try {
      const key = `session:${sessionId}:turns`;
      await this.client.rpush(key, JSON.stringify(turn));
      await this.client.expire(key, this.SESSION_TTL);

      // Keep only last 100 turns
      await this.client.ltrim(key, -100, -1);
      return true;
    } catch (error) {
      getLogger().warn(
        { error: String(error), sessionId },
        'Failed to add turn to cache (non-blocking)'
      );
      return false;
    }
  }

  /**
   * Get recent turns
   * Returns empty array if Redis unavailable
   */
  async getRecentTurns(
    sessionId: string,
    count = 20
  ): Promise<Array<{ role: string; content: string; timestamp: Date }>> {
    if (!this.client) {
      return [];
    }

    try {
      const key = `session:${sessionId}:turns`;
      const turns = await this.client.lrange(key, -count, -1);

      return turns.map((t) => {
        const parsed = JSON.parse(t);
        parsed.timestamp = new Date(parsed.timestamp);
        return parsed;
      });
    } catch (error) {
      getLogger().warn(
        { error: String(error), sessionId },
        'Failed to get cached turns (non-blocking)'
      );
      return [];
    }
  }

  /**
   * Get turn count
   * Returns 0 if Redis unavailable
   */
  async getTurnCount(sessionId: string): Promise<number> {
    if (!this.client) {
      return 0;
    }

    try {
      const key = `session:${sessionId}:turns`;
      const turns = await this.client.lrange(key, 0, -1);
      return turns.length;
    } catch (error) {
      getLogger().warn(
        { error: String(error), sessionId },
        'Failed to get turn count (non-blocking)'
      );
      return 0;
    }
  }

  // ============================================================================
  // ANALYSIS CACHING
  // ============================================================================

  /**
   * Cache analysis results
   * Fails silently if Redis unavailable
   */
  async cacheAnalysis(sessionId: string, analysis: Record<string, unknown>): Promise<boolean> {
    if (!this.client) {
      return false;
    }

    try {
      const key = `session:${sessionId}:analysis`;
      await this.client.setex(key, this.ANALYSIS_TTL, JSON.stringify(analysis));
      return true;
    } catch (error) {
      getLogger().warn(
        { error: String(error), sessionId },
        'Failed to cache analysis (non-blocking)'
      );
      return false;
    }
  }

  /**
   * Get cached analysis
   * Returns null if Redis unavailable
   */
  async getCachedAnalysis(sessionId: string): Promise<Record<string, unknown> | null> {
    if (!this.client) {
      return null;
    }

    try {
      const key = `session:${sessionId}:analysis`;
      const value = await this.client.get(key);

      if (!value) return null;
      return JSON.parse(value);
    } catch (error) {
      getLogger().warn(
        { error: String(error), sessionId },
        'Failed to get cached analysis (non-blocking)'
      );
      return null;
    }
  }

  // ============================================================================
  // USER SESSION MAPPING
  // ============================================================================

  /**
   * Map user to current session
   * Fails silently if Redis unavailable
   */
  async setUserSession(userId: string, sessionId: string): Promise<boolean> {
    if (!this.client) {
      return false;
    }

    try {
      const key = `user:${userId}:session`;
      await this.client.setex(key, this.SESSION_TTL, sessionId);
      return true;
    } catch (error) {
      getLogger().warn(
        { error: String(error), userId },
        'Failed to set user session (non-blocking)'
      );
      return false;
    }
  }

  /**
   * Get user's current session
   * Returns null if Redis unavailable
   */
  async getUserSession(userId: string): Promise<string | null> {
    if (!this.client) {
      return null;
    }

    try {
      const key = `user:${userId}:session`;
      return await this.client.get(key);
    } catch (error) {
      getLogger().warn(
        { error: String(error), userId },
        'Failed to get user session (non-blocking)'
      );
      return null;
    }
  }

  // ============================================================================
  // RATE LIMITING
  // ============================================================================

  /**
   * Increment rate counter and check limit
   * Returns allowed=true if Redis unavailable (fail-open for availability)
   */
  async checkRateLimit(
    userId: string,
    limit = 60
  ): Promise<{ allowed: boolean; current: number; remaining: number }> {
    if (!this.client) {
      // Fail open - allow request when cache unavailable
      return { allowed: true, current: 0, remaining: limit };
    }

    try {
      const key = `rate:${userId}`;
      const current = await this.client.incr(key);

      // Set TTL on first increment
      if (current === 1) {
        await this.client.expire(key, this.RATE_TTL);
      }

      return {
        allowed: current <= limit,
        current,
        remaining: Math.max(0, limit - current),
      };
    } catch (error) {
      getLogger().warn({ error: String(error), userId }, 'Rate limit check failed (fail-open)');
      // Fail open - allow request when cache unavailable
      return { allowed: true, current: 0, remaining: limit };
    }
  }

  // ============================================================================
  // GENERIC OPERATIONS (all fail silently for graceful degradation)
  // ============================================================================

  /**
   * Set a value with optional TTL
   * Fails silently if Redis unavailable
   */
  async set(key: string, value: unknown, ttlSeconds?: number): Promise<boolean> {
    if (!this.client) {
      return false;
    }

    try {
      const serialized = typeof value === 'string' ? value : JSON.stringify(value);

      if (ttlSeconds) {
        await this.client.setex(key, ttlSeconds, serialized);
      } else {
        await this.client.set(key, serialized);
      }
      return true;
    } catch (error) {
      getLogger().warn({ error: String(error), key }, 'Failed to set cache value (non-blocking)');
      return false;
    }
  }

  /**
   * Get a value
   * Returns null if Redis unavailable
   */
  async get<T = unknown>(key: string): Promise<T | null> {
    if (!this.client) {
      return null;
    }

    try {
      const value = await this.client.get(key);
      if (!value) return null;

      try {
        return JSON.parse(value) as T;
      } catch {
        return value as unknown as T;
      }
    } catch (error) {
      getLogger().warn({ error: String(error), key }, 'Failed to get cache value (non-blocking)');
      return null;
    }
  }

  /**
   * Delete a key
   * Fails silently if Redis unavailable
   */
  async delete(key: string): Promise<boolean> {
    if (!this.client) {
      return false;
    }

    try {
      const result = await this.client.del(key);
      return result > 0;
    } catch (error) {
      getLogger().warn({ error: String(error), key }, 'Failed to delete cache key (non-blocking)');
      return false;
    }
  }

  /**
   * Check if key exists
   * Returns false if Redis unavailable
   */
  async exists(key: string): Promise<boolean> {
    if (!this.client) {
      return false;
    }

    try {
      const result = await this.client.exists(key);
      return result > 0;
    } catch (error) {
      getLogger().warn(
        { error: String(error), key },
        'Failed to check cache key existence (non-blocking)'
      );
      return false;
    }
  }

  // ============================================================================
  // COMPRESSED OPERATIONS (for large payloads)
  // ============================================================================

  /**
   * Set a value with gzip compression
   * Useful for large JSON payloads (embeddings, conversation history, etc.)
   * Fails silently if Redis unavailable
   */
  async setCompressed(key: string, value: unknown, ttlSeconds?: number): Promise<boolean> {
    if (!this.client) {
      return false;
    }

    try {
      const serialized = typeof value === 'string' ? value : JSON.stringify(value);
      const compressed = await gzipAsync(Buffer.from(serialized));
      const base64 = compressed.toString('base64');

      if (ttlSeconds) {
        await this.client.setex(key, ttlSeconds, base64);
      } else {
        await this.client.set(key, base64);
      }

      getLogger().debug({
        key,
        originalSize: serialized.length,
        compressedSize: base64.length,
        ratio: (base64.length / serialized.length).toFixed(2),
      }, 'Stored compressed value');

      return true;
    } catch (error) {
      getLogger().warn({ error: String(error), key }, 'Failed to set compressed cache value (non-blocking)');
      return false;
    }
  }

  /**
   * Get a compressed value and decompress
   * Returns null if Redis unavailable or decompression fails
   */
  async getCompressed<T = unknown>(key: string): Promise<T | null> {
    if (!this.client) {
      return null;
    }

    try {
      const base64 = await this.client.get(key);
      if (!base64) return null;

      const compressed = Buffer.from(base64, 'base64');
      const decompressed = await gunzipAsync(compressed);
      const serialized = decompressed.toString('utf8');

      try {
        return JSON.parse(serialized) as T;
      } catch {
        return serialized as unknown as T;
      }
    } catch (error) {
      getLogger().warn({ error: String(error), key }, 'Failed to get compressed cache value (non-blocking)');
      return null;
    }
  }

  /**
   * Set session data with compression (for large session payloads)
   * Fails silently if Redis unavailable
   */
  async setSessionCompressed(
    sessionId: string,
    data: SessionCacheData,
    ttlSeconds?: number
  ): Promise<boolean> {
    return this.setCompressed(`session:${sessionId}:compressed`, data, ttlSeconds || this.SESSION_TTL);
  }

  /**
   * Get compressed session data
   * Returns null if Redis unavailable
   */
  async getSessionCompressed(sessionId: string): Promise<SessionCacheData | null> {
    return this.getCompressed<SessionCacheData>(`session:${sessionId}:compressed`);
  }

  /**
   * Close Redis connection
   */
  async close(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.client = null;
      this.initialized = false;
      getLogger().info('Redis connection closed');
    }
  }
}

// ============================================================================
// FACTORY
// ============================================================================

let redisInstance: RedisCache | null = null;

/**
 * Get the singleton Redis cache instance
 */
export function getRedisCache(config?: RedisConfig): RedisCache {
  if (!redisInstance) {
    redisInstance = new RedisCache(config);
  }
  return redisInstance;
}

/**
 * Reset the Redis cache (for testing)
 */
export async function resetRedisCache(): Promise<void> {
  if (redisInstance) {
    await redisInstance.close();
    redisInstance = null;
  }
}

export default RedisCache;
