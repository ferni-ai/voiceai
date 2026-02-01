/**
 * In-Memory Adapter for Unified Memory Store
 *
 * Provides fast in-process storage for testing and session-level caching.
 * Not suitable for production persistence.
 *
 * @module memory/unified-store/adapters/memory-adapter
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type {
  MemoryStoreAdapter,
  StoredMemory,
  SearchParams,
  ScoredMemory,
  StoreHealth,
  MemoryType,
} from '../types.js';

const log = createLogger({ module: 'MemoryAdapter' });

// ============================================================================
// TYPES
// ============================================================================

interface MemoryAdapterConfig {
  /** Maximum number of memories to store */
  maxSize?: number;
  /** Enable LRU eviction when maxSize reached */
  enableLruEviction?: boolean;
}

// ============================================================================
// IN-MEMORY ADAPTER
// ============================================================================

/**
 * In-memory adapter for the unified memory store
 *
 * Provides fast local storage for testing and session caching.
 * Uses LRU eviction when memory limit is reached.
 */
export class MemoryAdapter implements MemoryStoreAdapter {
  readonly name = 'memory';

  private memories = new Map<string, StoredMemory>();
  private accessOrder: string[] = [];
  private config: MemoryAdapterConfig;
  private initialized = false;

  // Metrics
  private successCount = 0;
  private errorCount = 0;
  private lastError: string | undefined;
  private lastSuccess: Date | undefined;
  private avgLatencyMs = 0;
  private latencyCount = 0;

  constructor(config?: MemoryAdapterConfig) {
    this.config = {
      maxSize: config?.maxSize || 10000,
      enableLruEviction: config?.enableLruEviction ?? true,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INITIALIZATION
  // ═══════════════════════════════════════════════════════════════════════════

  async initialize(): Promise<void> {
    this.initialized = true;
    log.debug('In-memory adapter initialized');
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CORE OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  async store(memory: StoredMemory): Promise<void> {
    const startTime = Date.now();

    try {
      const key = this.buildKey(memory.userId, memory.id);

      // Check size limit
      if (this.memories.size >= this.config.maxSize! && !this.memories.has(key)) {
        if (this.config.enableLruEviction) {
          this.evictLru();
        } else {
          throw new Error('Memory store full');
        }
      }

      this.memories.set(key, { ...memory, storageLayer: 'memory' });
      this.updateAccessOrder(key);

      this.recordSuccess(Date.now() - startTime);
      log.debug({ userId: memory.userId, memoryId: memory.id }, 'Memory stored in-memory');
    } catch (error) {
      this.recordError(error);
      throw error;
    }
  }

  async get(userId: string, memoryId: string): Promise<StoredMemory | null> {
    const startTime = Date.now();

    try {
      const key = this.buildKey(userId, memoryId);
      const memory = this.memories.get(key);

      if (memory) {
        this.updateAccessOrder(key);
      }

      this.recordSuccess(Date.now() - startTime);
      return memory || null;
    } catch (error) {
      this.recordError(error);
      throw error;
    }
  }

  async update(userId: string, memoryId: string, updates: Partial<StoredMemory>): Promise<void> {
    const startTime = Date.now();

    try {
      const key = this.buildKey(userId, memoryId);
      const existing = this.memories.get(key);

      if (existing) {
        this.memories.set(key, {
          ...existing,
          ...updates,
          updatedAt: new Date(),
        });
        this.updateAccessOrder(key);
      }

      this.recordSuccess(Date.now() - startTime);
    } catch (error) {
      this.recordError(error);
      throw error;
    }
  }

  async delete(userId: string, memoryId: string): Promise<void> {
    const startTime = Date.now();

    try {
      const key = this.buildKey(userId, memoryId);
      this.memories.delete(key);
      this.accessOrder = this.accessOrder.filter((k) => k !== key);

      this.recordSuccess(Date.now() - startTime);
    } catch (error) {
      this.recordError(error);
      throw error;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SEARCH OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  async search(params: SearchParams): Promise<ScoredMemory[]> {
    const startTime = Date.now();

    try {
      const results: ScoredMemory[] = [];

      for (const memory of this.memories.values()) {
        // Filter by userId
        if (memory.userId !== params.userId) continue;

        // Filter by types
        if (params.types && params.types.length > 0) {
          if (!params.types.includes(memory.type)) continue;
        }

        // Apply custom filters
        if (params.filters) {
          let match = true;
          for (const [field, value] of Object.entries(params.filters)) {
            if ((memory as unknown as Record<string, unknown>)[field] !== value) {
              match = false;
              break;
            }
          }
          if (!match) continue;
        }

        // Calculate basic score from importance
        const score = memory.importance;

        results.push({
          memory,
          score,
          scoreBreakdown: {
            semantic: 0, // In-memory doesn't do semantic search
            temporal: this.calculateTemporalScore(memory),
            emotional: memory.emotionalWeight,
            contextual: 0,
          },
          reason: 'In-memory filter match',
          triggerType: 'keyword',
        });
      }

      // Sort by score descending
      results.sort((a, b) => b.score - a.score);

      // Apply limit
      const limited = results.slice(0, params.topK || 10);

      this.recordSuccess(Date.now() - startTime);
      return limited;
    } catch (error) {
      this.recordError(error);
      throw error;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // BULK OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get all memories for a user
   */
  async getByUser(userId: string): Promise<StoredMemory[]> {
    const results: StoredMemory[] = [];

    for (const memory of this.memories.values()) {
      if (memory.userId === userId) {
        results.push(memory);
      }
    }

    return results;
  }

  /**
   * Clear all memories for a user
   */
  async clearUser(userId: string): Promise<number> {
    let count = 0;

    for (const [key, memory] of this.memories.entries()) {
      if (memory.userId === userId) {
        this.memories.delete(key);
        count++;
      }
    }

    this.accessOrder = this.accessOrder.filter((key) => {
      const memory = this.memories.get(key);
      return memory?.userId !== userId;
    });

    return count;
  }

  /**
   * Clear all memories
   */
  async clear(): Promise<void> {
    this.memories.clear();
    this.accessOrder = [];
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HEALTH & MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  async health(): Promise<StoreHealth> {
    const totalOps = this.successCount + this.errorCount;
    const errorRate = totalOps > 0 ? this.errorCount / totalOps : 0;

    return {
      healthy: true,
      name: this.name,
      initialized: this.initialized,
      latencyMs: this.avgLatencyMs,
      errorRate,
      lastError: this.lastError,
      lastSuccess: this.lastSuccess,
    };
  }

  async shutdown(): Promise<void> {
    this.memories.clear();
    this.accessOrder = [];
    this.initialized = false;
    log.debug('In-memory adapter shut down');
  }

  /**
   * Get current store size
   */
  getSize(): number {
    return this.memories.size;
  }

  /**
   * Get max store size
   */
  getMaxSize(): number {
    return this.config.maxSize!;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  private buildKey(userId: string, memoryId: string): string {
    return `${userId}:${memoryId}`;
  }

  private updateAccessOrder(key: string): void {
    // Remove from current position
    this.accessOrder = this.accessOrder.filter((k) => k !== key);
    // Add to end (most recently accessed)
    this.accessOrder.push(key);
  }

  private evictLru(): void {
    if (this.accessOrder.length === 0) return;

    // Evict least recently used (first in list)
    const lruKey = this.accessOrder.shift();
    if (lruKey) {
      this.memories.delete(lruKey);
      log.debug({ key: lruKey }, 'LRU eviction');
    }
  }

  private calculateTemporalScore(memory: StoredMemory): number {
    const now = Date.now();
    const memoryTime = memory.createdAt.getTime();
    const daysSinceCreation = (now - memoryTime) / (1000 * 60 * 60 * 24);

    // Exponential decay with half-life of 30 days
    return Math.pow(0.5, daysSinceCreation / 30);
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
    log.error({ error: String(error) }, 'Memory adapter error');
  }
}

// ============================================================================
// FACTORY
// ============================================================================

let instance: MemoryAdapter | null = null;

/**
 * Get or create the Memory adapter singleton
 */
export function getMemoryAdapter(config?: MemoryAdapterConfig): MemoryAdapter {
  if (!instance) {
    instance = new MemoryAdapter(config);
  }
  return instance;
}

/**
 * Reset the singleton (for testing)
 */
export function resetMemoryAdapter(): void {
  instance = null;
}
