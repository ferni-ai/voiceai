/**
 * Request Coalescer
 *
 * Prevents duplicate concurrent API calls by sharing in-flight request promises.
 * When multiple requests for the same content arrive simultaneously, only one
 * actual API call is made and all waiters share the result.
 *
 * Use case: Embedding generation where 10 concurrent requests for the same text
 * would normally call the API 10 times. With coalescing, we call once and share.
 *
 * Features:
 * - SHA256 content hashing (consistent with embedding-cache.ts)
 * - TTL-based cleanup to prevent memory leaks
 * - Capacity limits (maxPending)
 * - Error propagation to all waiters
 * - Stats tracking (coalesce rate)
 *
 * @example
 * const coalescer = getRequestCoalescer<number[]>('embeddings', {
 *   pendingTtlMs: 60000,
 *   maxPending: 10000,
 * });
 *
 * // These concurrent calls will share the same API request
 * const [result1, result2] = await Promise.all([
 *   coalescer.execute(hashContent(text), () => embedApi.embed(text)),
 *   coalescer.execute(hashContent(text), () => embedApi.embed(text)),
 * ]);
 */

import { createHash } from 'crypto';
import { getLogger } from './safe-logger.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

export interface CoalescerOptions {
  /** Time in ms before pending requests are auto-cleaned (default: 60000) */
  pendingTtlMs?: number;
  /** Maximum number of pending requests to track (default: 10000) */
  maxPending?: number;
}

export interface CoalescerStats {
  name: string;
  totalRequests: number;
  coalescedRequests: number;
  actualExecutions: number;
  coalesceRate: number;
  errors: number;
  currentPending: number;
}

interface PendingRequest<T> {
  promise: Promise<T>;
  waiterCount: number;
  createdAt: number;
  timeoutId: ReturnType<typeof setTimeout>;
  /** Marked true when TTL expires - new requests should not coalesce with expired entries */
  expired: boolean;
}

// ============================================================================
// REQUEST COALESCER CLASS
// ============================================================================

export class RequestCoalescer<T> {
  readonly name: string;
  private readonly pendingTtlMs: number;
  private readonly maxPending: number;
  private readonly pending = new Map<string, PendingRequest<T>>();

  // Stats
  private totalRequests = 0;
  private coalescedRequests = 0;
  private actualExecutions = 0;
  private errors = 0;

  constructor(name: string, options: CoalescerOptions = {}) {
    this.name = name;
    this.pendingTtlMs = options.pendingTtlMs ?? 60000;
    this.maxPending = options.maxPending ?? 10000;
  }

  /**
   * Execute a request with coalescing.
   * If a request with the same key is already in flight, share its result.
   *
   * @param key - Unique key for the request (use hashContent for text-based keys)
   * @param executor - Function that performs the actual request
   * @returns The result (either from a new request or a shared in-flight request)
   */
  async execute(key: string, executor: () => Promise<T>): Promise<T> {
    this.totalRequests++;

    // Check if there's already a pending request for this key
    const existing = this.pending.get(key);
    if (existing && !existing.expired) {
      // Only coalesce with non-expired requests
      existing.waiterCount++;
      this.coalescedRequests++;
      log.debug({ name: this.name, key: key.slice(0, 8), waiters: existing.waiterCount }, 'Request coalesced');
      return existing.promise;
    }

    // Check capacity
    if (this.pending.size >= this.maxPending) {
      this.errors++;
      throw new Error(`Request coalescer "${this.name}": Too many pending requests (${this.maxPending})`);
    }

    // Create new pending request
    this.actualExecutions++;

    // Wrap the executor to handle cleanup
    const wrappedPromise = (async (): Promise<T> => {
      try {
        const result = await executor();
        return result;
      } catch (error) {
        this.errors++;
        throw error;
      } finally {
        // Clean up after completion (success or error)
        const pending = this.pending.get(key);
        if (pending) {
          clearTimeout(pending.timeoutId);
          this.pending.delete(key);
        }
      }
    })();

    // Set up TTL timeout - marks entry as expired so new requests don't coalesce,
    // but keeps the entry so existing waiters can still receive their result
    const timeoutId = setTimeout(() => {
      const pending = this.pending.get(key);
      if (pending && !pending.expired) {
        log.warn(
          { name: this.name, key: key.slice(0, 8), waiters: pending.waiterCount },
          'Request coalescer TTL expired - new requests will not coalesce'
        );
        pending.expired = true;
      }
    }, this.pendingTtlMs);

    // Store the pending request
    this.pending.set(key, {
      promise: wrappedPromise,
      waiterCount: 1,
      createdAt: Date.now(),
      timeoutId,
      expired: false,
    });

    return wrappedPromise;
  }

  /**
   * Check if a key has a pending request
   */
  isPending(key: string): boolean {
    return this.pending.has(key);
  }

  /**
   * Get current stats
   */
  getStats(): CoalescerStats {
    const total = this.totalRequests;
    return {
      name: this.name,
      totalRequests: this.totalRequests,
      coalescedRequests: this.coalescedRequests,
      actualExecutions: this.actualExecutions,
      coalesceRate: total > 0 ? this.coalescedRequests / total : 0,
      errors: this.errors,
      currentPending: this.pending.size,
    };
  }

  /**
   * Clear all pending requests and stats (for shutdown/testing)
   */
  clear(): void {
    // Clear all timeouts
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeoutId);
    }
    this.pending.clear();
    this.totalRequests = 0;
    this.coalescedRequests = 0;
    this.actualExecutions = 0;
    this.errors = 0;
  }
}

// ============================================================================
// CONTENT HASHING
// ============================================================================

/**
 * Generate a SHA256 hash of content.
 * Consistent with embedding-cache.ts for key generation.
 */
export function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

// ============================================================================
// REGISTRY
// ============================================================================

const coalescers = new Map<string, RequestCoalescer<unknown>>();

/**
 * Get or create a request coalescer by name.
 * Uses registry pattern for singleton access.
 */
export function getRequestCoalescer<T>(name: string, options?: CoalescerOptions): RequestCoalescer<T> {
  let coalescer = coalescers.get(name);
  if (!coalescer) {
    coalescer = new RequestCoalescer<unknown>(name, options);
    coalescers.set(name, coalescer);
  }
  return coalescer as RequestCoalescer<T>;
}

/**
 * Get stats for all registered coalescers
 */
export function getAllCoalescerStats(): CoalescerStats[] {
  return Array.from(coalescers.values()).map((c) => c.getStats());
}

/**
 * Reset all coalescers (for testing)
 */
export function resetAllCoalescers(): void {
  for (const coalescer of coalescers.values()) {
    coalescer.clear();
  }
  coalescers.clear();
}

export default {
  RequestCoalescer,
  getRequestCoalescer,
  getAllCoalescerStats,
  resetAllCoalescers,
  hashContent,
};
