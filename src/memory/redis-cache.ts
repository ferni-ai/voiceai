/**
 * Redis Cache Layer
 *
 * Fast, ephemeral caching for session data using Redis.
 * Works with Google Cloud Memorystore for Redis in production.
 *
 * Requires: npm install ioredis
 *
 * Environment:
 * - REDIS_URL: Redis connection string (e.g., redis://localhost:6379)
 * - REDIS_HOST: Redis host (alternative to URL)
 * - REDIS_PORT: Redis port (default: 6379)
 * - REDIS_PASSWORD: Redis password (if required)
 */

import { log } from '@livekit/agents';

const getLogger = () => log();

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
   */
  async setSession(
    sessionId: string,
    data: Record<string, unknown>,
    ttlSeconds?: number
  ): Promise<void> {
    if (!this.client) throw new Error('Redis not initialized');

    const key = `session:${sessionId}`;
    const value = JSON.stringify(data);

    await this.client.setex(key, ttlSeconds || this.SESSION_TTL, value);
    getLogger().debug(`Cached session: ${sessionId}`);
  }

  /**
   * Get session data
   */
  async getSession(sessionId: string): Promise<Record<string, unknown> | null> {
    if (!this.client) throw new Error('Redis not initialized');

    const key = `session:${sessionId}`;
    const value = await this.client.get(key);

    if (!value) return null;

    return JSON.parse(value);
  }

  /**
   * Delete session data
   */
  async deleteSession(sessionId: string): Promise<void> {
    if (!this.client) throw new Error('Redis not initialized');

    const keys = await this.client.keys(`session:${sessionId}*`);
    if (keys.length > 0) {
      await this.client.del(keys);
    }

    getLogger().debug(`Deleted session: ${sessionId}`);
  }

  /**
   * Extend session TTL
   */
  async extendSession(sessionId: string, ttlSeconds?: number): Promise<void> {
    if (!this.client) throw new Error('Redis not initialized');

    const key = `session:${sessionId}`;
    await this.client.expire(key, ttlSeconds || this.SESSION_TTL);
  }

  // ============================================================================
  // CONVERSATION TURNS
  // ============================================================================

  /**
   * Add a conversation turn
   */
  async addTurn(
    sessionId: string,
    turn: { role: string; content: string; timestamp: Date }
  ): Promise<void> {
    if (!this.client) throw new Error('Redis not initialized');

    const key = `session:${sessionId}:turns`;
    await this.client.rpush(key, JSON.stringify(turn));
    await this.client.expire(key, this.SESSION_TTL);

    // Keep only last 100 turns
    await this.client.ltrim(key, -100, -1);
  }

  /**
   * Get recent turns
   */
  async getRecentTurns(
    sessionId: string,
    count: number = 20
  ): Promise<Array<{ role: string; content: string; timestamp: Date }>> {
    if (!this.client) throw new Error('Redis not initialized');

    const key = `session:${sessionId}:turns`;
    const turns = await this.client.lrange(key, -count, -1);

    return turns.map((t) => {
      const parsed = JSON.parse(t);
      parsed.timestamp = new Date(parsed.timestamp);
      return parsed;
    });
  }

  /**
   * Get turn count
   */
  async getTurnCount(sessionId: string): Promise<number> {
    if (!this.client) throw new Error('Redis not initialized');

    const key = `session:${sessionId}:turns`;
    const turns = await this.client.lrange(key, 0, -1);
    return turns.length;
  }

  // ============================================================================
  // ANALYSIS CACHING
  // ============================================================================

  /**
   * Cache analysis results
   */
  async cacheAnalysis(sessionId: string, analysis: Record<string, unknown>): Promise<void> {
    if (!this.client) throw new Error('Redis not initialized');

    const key = `session:${sessionId}:analysis`;
    await this.client.setex(key, this.ANALYSIS_TTL, JSON.stringify(analysis));
  }

  /**
   * Get cached analysis
   */
  async getCachedAnalysis(sessionId: string): Promise<Record<string, unknown> | null> {
    if (!this.client) throw new Error('Redis not initialized');

    const key = `session:${sessionId}:analysis`;
    const value = await this.client.get(key);

    if (!value) return null;
    return JSON.parse(value);
  }

  // ============================================================================
  // USER SESSION MAPPING
  // ============================================================================

  /**
   * Map user to current session
   */
  async setUserSession(userId: string, sessionId: string): Promise<void> {
    if (!this.client) throw new Error('Redis not initialized');

    const key = `user:${userId}:session`;
    await this.client.setex(key, this.SESSION_TTL, sessionId);
  }

  /**
   * Get user's current session
   */
  async getUserSession(userId: string): Promise<string | null> {
    if (!this.client) throw new Error('Redis not initialized');

    const key = `user:${userId}:session`;
    return await this.client.get(key);
  }

  // ============================================================================
  // RATE LIMITING
  // ============================================================================

  /**
   * Increment rate counter and check limit
   */
  async checkRateLimit(
    userId: string,
    limit: number = 60
  ): Promise<{ allowed: boolean; current: number; remaining: number }> {
    if (!this.client) throw new Error('Redis not initialized');

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
  }

  // ============================================================================
  // GENERIC OPERATIONS
  // ============================================================================

  /**
   * Set a value with optional TTL
   */
  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    if (!this.client) throw new Error('Redis not initialized');

    const serialized = typeof value === 'string' ? value : JSON.stringify(value);

    if (ttlSeconds) {
      await this.client.setex(key, ttlSeconds, serialized);
    } else {
      await this.client.set(key, serialized);
    }
  }

  /**
   * Get a value
   */
  async get<T = unknown>(key: string): Promise<T | null> {
    if (!this.client) throw new Error('Redis not initialized');

    const value = await this.client.get(key);
    if (!value) return null;

    try {
      return JSON.parse(value) as T;
    } catch {
      return value as unknown as T;
    }
  }

  /**
   * Delete a key
   */
  async delete(key: string): Promise<boolean> {
    if (!this.client) throw new Error('Redis not initialized');

    const result = await this.client.del(key);
    return result > 0;
  }

  /**
   * Check if key exists
   */
  async exists(key: string): Promise<boolean> {
    if (!this.client) throw new Error('Redis not initialized');

    const result = await this.client.exists(key);
    return result > 0;
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
