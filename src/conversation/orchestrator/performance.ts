/**
 * Orchestrator Performance Optimizations
 *
 * Provides:
 * - LRU cache for detection results
 * - Circuit breakers for slow/failing systems
 * - Lazy loading helpers
 * - Timeout wrappers
 *
 * @module @ferni/conversation/orchestrator/performance
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'OrchestratorPerformance' });

// ============================================================================
// LRU CACHE
// ============================================================================

interface CacheEntry<T> {
  value: T;
  timestamp: number;
}

/**
 * Simple LRU cache with TTL
 */
export class LRUCache<K, V> {
  private cache = new Map<K, CacheEntry<V>>();
  private readonly maxSize: number;
  private readonly ttlMs: number;

  constructor(maxSize: number = 100, ttlMs: number = 60000) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
  }

  get(key: K): V | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    // Check TTL
    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(key);
      return undefined;
    }

    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.value;
  }

  set(key: K, value: V): void {
    // Remove oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, { value, timestamp: Date.now() });
  }

  has(key: K): boolean {
    return this.get(key) !== undefined; // Uses TTL check
  }

  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }

  /**
   * Get or compute value
   */
  getOrCompute(key: K, compute: () => V): V {
    const cached = this.get(key);
    if (cached !== undefined) return cached;

    const value = compute();
    this.set(key, value);
    return value;
  }

  /**
   * Get or compute async value
   */
  async getOrComputeAsync(key: K, compute: () => Promise<V>): Promise<V> {
    const cached = this.get(key);
    if (cached !== undefined) return cached;

    const value = await compute();
    this.set(key, value);
    return value;
  }
}

// ============================================================================
// CIRCUIT BREAKER
// ============================================================================

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerConfig {
  /** Number of failures before opening circuit */
  failureThreshold: number;
  /** Time to wait before trying again (ms) */
  resetTimeoutMs: number;
  /** Number of successes needed to close from half-open */
  successThreshold: number;
  /** Name for logging */
  name: string;
}

const DEFAULT_CIRCUIT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  resetTimeoutMs: 30000,
  successThreshold: 2,
  name: 'unknown',
};

/**
 * Circuit breaker for protecting against slow/failing systems
 */
export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failures = 0;
  private successes = 0;
  private lastFailureTime = 0;
  private readonly config: CircuitBreakerConfig;

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = { ...DEFAULT_CIRCUIT_CONFIG, ...config };
  }

  /**
   * Check if the circuit is open (should skip the operation)
   */
  isOpen(): boolean {
    if (this.state === 'closed') return false;

    if (this.state === 'open') {
      // Check if we should try again
      if (Date.now() - this.lastFailureTime > this.config.resetTimeoutMs) {
        this.state = 'half-open';
        this.successes = 0;
        log.debug({ name: this.config.name }, '⚡ Circuit half-open, trying again');
        return false;
      }
      return true;
    }

    // half-open - allow the request through
    return false;
  }

  /**
   * Record a successful operation
   */
  recordSuccess(): void {
    if (this.state === 'half-open') {
      this.successes++;
      if (this.successes >= this.config.successThreshold) {
        this.state = 'closed';
        this.failures = 0;
        log.info({ name: this.config.name }, '✅ Circuit closed (recovered)');
      }
    } else {
      this.failures = 0; // Reset failures on success
    }
  }

  /**
   * Record a failed operation
   */
  recordFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.state === 'half-open') {
      this.state = 'open';
      log.warn({ name: this.config.name }, '⛔ Circuit reopened (failure in half-open)');
    } else if (this.failures >= this.config.failureThreshold) {
      this.state = 'open';
      log.warn(
        { name: this.config.name, failures: this.failures },
        '⛔ Circuit opened (too many failures)'
      );
    }
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(
    fn: () => Promise<T>,
    fallback?: T
  ): Promise<{ success: boolean; value: T | undefined; fromCircuit: boolean }> {
    if (this.isOpen()) {
      return { success: false, value: fallback, fromCircuit: true };
    }

    try {
      const value = await fn();
      this.recordSuccess();
      return { success: true, value, fromCircuit: false };
    } catch (error) {
      this.recordFailure();
      return { success: false, value: fallback, fromCircuit: false };
    }
  }

  /**
   * Get current state
   */
  getState(): { state: CircuitState; failures: number; successes: number } {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
    };
  }

  /**
   * Reset the circuit breaker
   */
  reset(): void {
    this.state = 'closed';
    this.failures = 0;
    this.successes = 0;
    this.lastFailureTime = 0;
  }
}

// ============================================================================
// TIMEOUT WRAPPER
// ============================================================================

/**
 * Execute a function with a timeout
 */
export async function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  fallback?: T
): Promise<{ value: T | undefined; timedOut: boolean }> {
  let timeoutHandle: NodeJS.Timeout | undefined;

  const timeoutPromise = new Promise<{ value: undefined; timedOut: true }>((resolve) => {
    timeoutHandle = setTimeout(() => {
      resolve({ value: undefined, timedOut: true });
    }, timeoutMs);
  });

  const resultPromise = fn().then((value) => {
    clearTimeout(timeoutHandle);
    return { value, timedOut: false as const };
  });

  const result = await Promise.race([resultPromise, timeoutPromise]);

  if (result.timedOut && fallback !== undefined) {
    return { value: fallback, timedOut: true };
  }

  return result;
}

// ============================================================================
// LAZY LOADER
// ============================================================================

/**
 * Lazy loader for modules that should only be loaded when needed
 */
export class LazyLoader<T> {
  private instance: T | null = null;
  private loading: Promise<T> | null = null;
  private readonly loader: () => Promise<T>;
  private readonly name: string;

  constructor(loader: () => Promise<T>, name: string = 'unknown') {
    this.loader = loader;
    this.name = name;
  }

  /**
   * Get the instance, loading if necessary
   */
  async get(): Promise<T> {
    if (this.instance !== null) {
      return this.instance;
    }

    if (this.loading !== null) {
      return this.loading;
    }

    log.debug({ name: this.name }, '📦 Lazy loading module');

    this.loading = this.loader().then((instance) => {
      this.instance = instance;
      this.loading = null;
      return instance;
    });

    return this.loading;
  }

  /**
   * Check if already loaded
   */
  isLoaded(): boolean {
    return this.instance !== null;
  }

  /**
   * Reset (unload)
   */
  reset(): void {
    this.instance = null;
    this.loading = null;
  }
}

// ============================================================================
// DETECTION CACHE
// ============================================================================

// Shared cache for detection results (message -> analysis result)
const detectionCache = new LRUCache<string, unknown>(200, 30000); // 30s TTL

/**
 * Get cached detection result
 */
export function getCachedDetection<T>(key: string): T | undefined {
  return detectionCache.get(key) as T | undefined;
}

/**
 * Set cached detection result
 */
export function setCachedDetection<T>(key: string, value: T): void {
  detectionCache.set(key, value);
}

/**
 * Get or compute cached detection
 */
export function getOrComputeDetection<T>(key: string, compute: () => T): T {
  return detectionCache.getOrCompute(key, compute) as T;
}

/**
 * Get or compute cached detection, also returning whether it was a cache hit.
 *
 * NOTE: This treats `undefined` as a cache miss. Detection functions in this
 * module should return defined values (booleans/objects), so this is fine.
 */
export function getOrComputeDetectionWithHit<T>(
  key: string,
  compute: () => T
): { value: T; hit: boolean } {
  const cached = getCachedDetection<T>(key);
  if (cached !== undefined) {
    return { value: cached, hit: true };
  }

  const value = compute();
  setCachedDetection(key, value);
  return { value, hit: false };
}

/**
 * Clear detection cache
 */
export function clearDetectionCache(): void {
  detectionCache.clear();
}

// ============================================================================
// CIRCUIT BREAKERS FOR ORCHESTRATOR SYSTEMS
// ============================================================================

const circuitBreakers = new Map<string, CircuitBreaker>();

/**
 * Get or create a circuit breaker for a system
 */
export function getCircuitBreaker(
  system: 'sessionIntelligence' | 'betterThanHuman' | 'advancedHumanization' | 'deepHumanization',
  config?: Partial<CircuitBreakerConfig>
): CircuitBreaker {
  if (!circuitBreakers.has(system)) {
    circuitBreakers.set(
      system,
      new CircuitBreaker({
        name: system,
        failureThreshold: 3,
        resetTimeoutMs: 15000, // 15s
        successThreshold: 2,
        ...config,
      })
    );
  }
  return circuitBreakers.get(system)!;
}

/**
 * Reset all circuit breakers
 */
export function resetAllCircuitBreakers(): void {
  for (const breaker of circuitBreakers.values()) {
    breaker.reset();
  }
}

/**
 * Get status of all circuit breakers
 */
export function getCircuitBreakerStatus(): Record<
  string,
  { state: CircuitState; failures: number }
> {
  const status: Record<string, { state: CircuitState; failures: number }> = {};
  for (const [name, breaker] of circuitBreakers) {
    const state = breaker.getState();
    status[name] = { state: state.state, failures: state.failures };
  }
  return status;
}

// ============================================================================
// PERFORMANCE STATS
// ============================================================================

/**
 * Get performance stats for debugging
 */
export function getPerformanceStats(): {
  detectionCacheSize: number;
  circuitBreakers: Record<string, { state: CircuitState; failures: number }>;
} {
  return {
    detectionCacheSize: detectionCache.size,
    circuitBreakers: getCircuitBreakerStatus(),
  };
}

/**
 * Reset all performance optimizations
 */
export function resetPerformanceOptimizations(): void {
  clearDetectionCache();
  resetAllCircuitBreakers();
}
