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

export interface CoalescerOptions<T = unknown> {
  /** Time in ms before pending requests are auto-cleaned (default: 60000) */
  pendingTtlMs?: number;
  /** Maximum number of pending requests to track (default: 10000) */
  maxPending?: number;
  /**
   * Optional function to clone results before returning to waiters.
   * Prevents mutation bugs when multiple callers share the same result.
   * For primitive types (strings, numbers) this is not needed.
   * For arrays/objects, use structuredClone or a custom cloner.
   *
   * @example
   * // For arrays of numbers (like embeddings)
   * cloneResult: (arr) => [...arr]
   *
   * // For complex objects
   * cloneResult: (obj) => structuredClone(obj)
   */
  cloneResult?: (result: T) => T;
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
// OBSERVABILITY / METRICS CALLBACKS
// ============================================================================

/**
 * Metrics callbacks for observability integration.
 * These are optional hooks that can be registered to receive events from coalescers.
 */
export interface CoalescerMetricsCallbacks {
  /** Called when a request is coalesced with an existing in-flight request */
  onCoalesce?: (name: string, key: string, waiterCount: number) => void;
  /** Called when a coalescer is approaching its capacity limit (>80% full) */
  onCapacityWarning?: (name: string, current: number, max: number) => void;
  /** Called when a request completes (success or error) */
  onComplete?: (name: string, key: string, durationMs: number, success: boolean) => void;
}

let metricsCallbacks: CoalescerMetricsCallbacks | null = null;

/**
 * Configure global metrics callbacks for all coalescers.
 * This allows integration with observability systems.
 *
 * @example
 * configureCoalescerMetrics({
 *   onCoalesce: (name, key, waiters) => {
 *     prometheus.inc('coalescer_coalesced_total', { name });
 *   },
 *   onCapacityWarning: (name, current, max) => {
 *     logger.warn({ name, current, max }, 'Coalescer approaching capacity');
 *   },
 * });
 */
export function configureCoalescerMetrics(callbacks: CoalescerMetricsCallbacks): void {
  metricsCallbacks = callbacks;
  log.debug({ hasOnCoalesce: !!callbacks.onCoalesce, hasOnCapacityWarning: !!callbacks.onCapacityWarning }, 'Coalescer metrics callbacks configured');
}

/**
 * Reset metrics callbacks (for testing).
 */
export function resetCoalescerMetrics(): void {
  metricsCallbacks = null;
}

/** Capacity warning threshold (80%) */
const CAPACITY_WARNING_THRESHOLD = 0.8;

// ============================================================================
// REQUEST COALESCER CLASS
// ============================================================================

export class RequestCoalescer<T> {
  readonly name: string;
  private readonly pendingTtlMs: number;
  private readonly maxPending: number;
  private readonly cloneResult: ((result: T) => T) | null;
  private readonly pending = new Map<string, PendingRequest<T>>();

  // Stats
  private totalRequests = 0;
  private coalescedRequests = 0;
  private actualExecutions = 0;
  private errors = 0;

  constructor(name: string, options: CoalescerOptions<T> = {}) {
    this.name = name;
    this.pendingTtlMs = options.pendingTtlMs ?? 60000;
    this.maxPending = options.maxPending ?? 10000;
    this.cloneResult = options.cloneResult ?? null;
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
      // Notify metrics callback (wrapped in try-catch to not break coalescing)
      try {
        metricsCallbacks?.onCoalesce?.(this.name, key, existing.waiterCount);
      } catch (callbackError) {
        log.warn({ error: String(callbackError), name: this.name }, 'Metrics onCoalesce callback threw - ignoring');
      }
      // Clone result for coalesced waiters to prevent shared mutations
      if (this.cloneResult) {
        return existing.promise.then((result) => this.cloneResult!(result));
      }
      return existing.promise;
    }

    // Check capacity (only count non-expired entries since we'll replace expired ones)
    const effectiveSize = existing?.expired ? this.pending.size - 1 : this.pending.size;
    if (effectiveSize >= this.maxPending) {
      this.errors++;
      throw new Error(`Request coalescer "${this.name}": Too many pending requests (${this.maxPending})`);
    }

    // Warn if approaching capacity threshold
    if (effectiveSize >= this.maxPending * CAPACITY_WARNING_THRESHOLD) {
      try {
        metricsCallbacks?.onCapacityWarning?.(this.name, effectiveSize, this.maxPending);
      } catch (callbackError) {
        log.warn({ error: String(callbackError), name: this.name }, 'Metrics onCapacityWarning callback threw - ignoring');
      }
    }

    // Clean up orphaned timeout from expired entry before replacing it.
    // The expired entry's promise is still valid for its waiters, but its timeout
    // is now orphaned since we're creating a replacement entry.
    if (existing?.expired) {
      clearTimeout(existing.timeoutId);
    }

    // Create new pending request
    this.actualExecutions++;

    // Create the entry object first so we can reference it in the cleanup.
    // This is critical for correctness: if TTL expires and a new request
    // creates a replacement entry, we must NOT clean up the replacement.
    const entry: PendingRequest<T> = {
      promise: null as unknown as Promise<T>, // Will be set below
      waiterCount: 1,
      createdAt: Date.now(),
      timeoutId: null as unknown as ReturnType<typeof setTimeout>, // Will be set below
      expired: false,
    };

    // Track execution start time for metrics
    const executionStartTime = Date.now();

    // Wrap the executor to handle cleanup
    const wrappedPromise = (async (): Promise<T> => {
      let success = false;
      try {
        const result = await executor();
        success = true;
        return result;
      } catch (error) {
        this.errors++;
        throw error;
      } finally {
        // Notify completion callback (wrapped in try-catch to ensure cleanup always runs)
        const durationMs = Date.now() - executionStartTime;
        try {
          metricsCallbacks?.onComplete?.(this.name, key, durationMs, success);
        } catch (callbackError) {
          log.warn({ error: String(callbackError), name: this.name }, 'Metrics onComplete callback threw - ignoring');
        }

        // Clean up after completion (success or error).
        // IMPORTANT: Only clean up if this entry is still the current one for this key.
        // If TTL expired and a new request replaced our entry, we must not touch it.
        const currentEntry = this.pending.get(key);
        if (currentEntry === entry) {
          clearTimeout(entry.timeoutId);
          this.pending.delete(key);
        }
        // If currentEntry !== entry, a replacement was created after our TTL expired.
        // Leave it alone - it belongs to a different request.
      }
    })();

    // Set up TTL timeout - marks entry as expired so new requests don't coalesce,
    // but keeps the entry so existing waiters can still receive their result
    const timeoutId = setTimeout(() => {
      // Check that this entry is still the current one (not replaced)
      const currentEntry = this.pending.get(key);
      if (currentEntry === entry && !entry.expired) {
        log.warn(
          { name: this.name, key: key.slice(0, 8), waiters: entry.waiterCount },
          'Request coalescer TTL expired - new requests will not coalesce'
        );
        entry.expired = true;
      }
    }, this.pendingTtlMs);

    // Complete the entry initialization
    entry.promise = wrappedPromise;
    entry.timeoutId = timeoutId;

    // Store the pending request
    this.pending.set(key, entry);

    // Clone result for original caller to ensure mutation safety
    if (this.cloneResult) {
      return wrappedPromise.then((result) => this.cloneResult!(result));
    }
    return wrappedPromise;
  }

  /**
   * Check if a key has a pending request
   */
  isPending(key: string): boolean {
    return this.pending.has(key);
  }

  /**
   * Get the configured TTL in milliseconds
   */
  getPendingTtlMs(): number {
    return this.pendingTtlMs;
  }

  /**
   * Get the configured max pending limit
   */
  getMaxPending(): number {
    return this.maxPending;
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
 *
 * Note: Options are only used when creating a new coalescer. If a coalescer
 * with the given name already exists, the provided options are ignored and
 * a warning is logged if they differ from the existing configuration.
 */
export function getRequestCoalescer<T>(name: string, options?: CoalescerOptions<T>): RequestCoalescer<T> {
  const existing = coalescers.get(name);
  if (existing) {
    // Warn if different options were requested (they'll be ignored)
    if (options) {
      const existingTtl = existing.getPendingTtlMs();
      const existingMax = existing.getMaxPending();
      const requestedTtl = options.pendingTtlMs ?? 60000;
      const requestedMax = options.maxPending ?? 10000;

      if (requestedTtl !== existingTtl || requestedMax !== existingMax) {
        log.warn(
          {
            name,
            existing: { pendingTtlMs: existingTtl, maxPending: existingMax },
            requested: { pendingTtlMs: requestedTtl, maxPending: requestedMax },
          },
          'Request coalescer already exists with different options - using existing configuration'
        );
      }
    }
    return existing as RequestCoalescer<T>;
  }

  const coalescer = new RequestCoalescer<T>(name, options);
  coalescers.set(name, coalescer as RequestCoalescer<unknown>);
  return coalescer;
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
  configureCoalescerMetrics,
  resetCoalescerMetrics,
};
