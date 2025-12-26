/**
 * Circuit Breaker Pattern
 *
 * Prevents cascading failures by stopping requests to failing services
 * after a threshold of failures. The circuit "opens" to prevent more
 * requests, then "half-opens" to test if the service has recovered.
 *
 * FIX BUG #10: Added to prevent hammering failing external APIs
 *
 * Usage:
 *   const breaker = new CircuitBreaker('spotify-api', { failureThreshold: 5 });
 *   const result = await breaker.execute(() => spotifyRequest('/me'));
 */

import { getLogger } from './safe-logger.js';

// ============================================================================
// STATE CHANGE CALLBACK (Dependency Injection for metrics)
// ============================================================================

/**
 * Callback type for circuit breaker state changes.
 * Services layer can register a callback to receive state change events.
 */
export type CircuitBreakerStateCallback = (
  name: string,
  state: CircuitState,
  failures: number,
  successes: number,
  reason?: string
) => void;

let stateChangeCallback: CircuitBreakerStateCallback | null = null;

/**
 * Register a callback to be notified of circuit breaker state changes.
 * This allows the services layer to hook into state changes for metrics.
 *
 * @example
 * // In services/observability/resilience-metrics.ts:
 * import { registerCircuitBreakerCallback } from '../../utils/circuit-breaker.js';
 *
 * registerCircuitBreakerCallback((name, state, failures, successes, reason) => {
 *   resilienceMetrics.recordCircuitBreakerEvent(name, state, failures, successes, reason);
 * });
 */
export function registerCircuitBreakerCallback(callback: CircuitBreakerStateCallback): void {
  stateChangeCallback = callback;
}

/**
 * Clear the registered callback (for testing).
 */
export function clearCircuitBreakerCallback(): void {
  stateChangeCallback = null;
}

// ============================================================================
// TYPES
// ============================================================================

export interface CircuitBreakerOptions {
  /** Number of failures before opening the circuit (default: 5) */
  failureThreshold?: number;

  /** Time in ms before trying a request in half-open state (default: 30000) */
  resetTimeout?: number;

  /** Time in ms for the success threshold window (default: 60000) */
  successThresholdWindow?: number;

  /** Number of successes in half-open state to close circuit (default: 2) */
  successThreshold?: number;

  /** Custom error to throw when circuit is open */
  openCircuitError?: Error;
}

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerStats {
  name: string;
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailure?: Date;
  lastSuccess?: Date;
  totalCalls: number;
  totalFailures: number;
}

// ============================================================================
// CIRCUIT BREAKER CLASS
// ============================================================================

export class CircuitBreaker {
  private readonly name: string;
  private readonly failureThreshold: number;
  private readonly resetTimeout: number;
  private readonly successThreshold: number;

  private state: CircuitState = 'closed';
  private failures = 0;
  private successes = 0;
  private lastFailure?: Date;
  private lastSuccess?: Date;
  private nextAttempt?: Date;
  private totalCalls = 0;
  private totalFailures = 0;

  constructor(name: string, options: CircuitBreakerOptions = {}) {
    this.name = name;
    this.failureThreshold = options.failureThreshold ?? 5;
    this.resetTimeout = options.resetTimeout ?? 30000;
    this.successThreshold = options.successThreshold ?? 2;
  }

  /**
   * Execute a function through the circuit breaker
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.totalCalls++;

    // Check if circuit is open
    if (this.state === 'open') {
      if (this.nextAttempt && new Date() >= this.nextAttempt) {
        // Try half-open state
        this.state = 'half-open';
        getLogger().info({ name: this.name }, 'Circuit breaker entering half-open state');
      } else {
        const waitMs = this.nextAttempt
          ? this.nextAttempt.getTime() - Date.now()
          : this.resetTimeout;
        throw new CircuitOpenError(
          `Circuit breaker "${this.name}" is OPEN. Service unavailable. Retry in ${Math.ceil(waitMs / 1000)}s`
        );
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.onFailure(errorMessage);
      throw error;
    }
  }

  /**
   * Check if a request can be made (doesn't execute anything)
   */
  canRequest(): boolean {
    if (this.state === 'closed') return true;
    if (this.state === 'half-open') return true;
    if (this.state === 'open' && this.nextAttempt && new Date() >= this.nextAttempt) {
      return true;
    }
    return false;
  }

  /**
   * Get current stats
   */
  getStats(): CircuitBreakerStats {
    return {
      name: this.name,
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailure: this.lastFailure,
      lastSuccess: this.lastSuccess,
      totalCalls: this.totalCalls,
      totalFailures: this.totalFailures,
    };
  }

  /**
   * Force reset the circuit breaker
   */
  reset(): void {
    this.state = 'closed';
    this.failures = 0;
    this.successes = 0;
    this.nextAttempt = undefined;
    getLogger().info({ name: this.name }, 'Circuit breaker manually reset');
  }

  private onSuccess(): void {
    this.lastSuccess = new Date();
    this.successes++;

    if (this.state === 'half-open') {
      if (this.successes >= this.successThreshold) {
        const previousState = this.state;
        this.state = 'closed';
        this.failures = 0;
        this.successes = 0;
        getLogger().info({ name: this.name }, 'Circuit breaker CLOSED (service recovered)');

        // Report state change via callback (if registered)
        stateChangeCallback?.(this.name, 'closed', this.failures, this.successes, undefined);
      }
    } else {
      // Reset failure count on success in closed state
      this.failures = 0;
    }
  }

  private onFailure(reason?: string): void {
    this.lastFailure = new Date();
    this.failures++;
    this.totalFailures++;

    if (this.state === 'half-open') {
      // Single failure in half-open goes back to open
      this.state = 'open';
      this.nextAttempt = new Date(Date.now() + this.resetTimeout);
      this.successes = 0;
      getLogger().warn(
        { name: this.name, nextAttempt: this.nextAttempt },
        'Circuit breaker OPEN (half-open test failed)'
      );

      // Report state change via callback (if registered)
      stateChangeCallback?.(
        this.name,
        'open',
        this.failures,
        this.successes,
        reason || 'half-open test failed'
      );
    } else if (this.failures >= this.failureThreshold) {
      this.state = 'open';
      this.nextAttempt = new Date(Date.now() + this.resetTimeout);
      getLogger().warn(
        { name: this.name, failures: this.failures, nextAttempt: this.nextAttempt },
        'Circuit breaker OPEN (failure threshold reached)'
      );

      // Report state change via callback (if registered)
      stateChangeCallback?.(
        this.name,
        'open',
        this.failures,
        this.successes,
        reason || 'failure threshold reached'
      );
    }
  }
}

// ============================================================================
// CUSTOM ERROR
// ============================================================================

export class CircuitOpenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CircuitOpenError';
  }
}

// ============================================================================
// CIRCUIT BREAKER REGISTRY
// ============================================================================

const breakers = new Map<string, CircuitBreaker>();

/**
 * Get or create a circuit breaker by name
 */
export function getCircuitBreaker(name: string, options?: CircuitBreakerOptions): CircuitBreaker {
  let breaker = breakers.get(name);
  if (!breaker) {
    breaker = new CircuitBreaker(name, options);
    breakers.set(name, breaker);
  }
  return breaker;
}

/**
 * Get all circuit breaker stats (for monitoring)
 */
export function getAllCircuitBreakerStats(): CircuitBreakerStats[] {
  return Array.from(breakers.values()).map((b) => b.getStats());
}

/**
 * Reset all circuit breakers (for testing)
 */
export function resetAllCircuitBreakers(): void {
  for (const breaker of breakers.values()) {
    breaker.reset();
  }
}

// ============================================================================
// HELPER FOR WRAPPING EXTERNAL CALLS
// ============================================================================

/**
 * Wrap an async function with circuit breaker protection
 *
 * @param name - Name for the circuit breaker
 * @param fn - Async function to wrap
 * @param options - Circuit breaker options
 * @returns Wrapped function with circuit breaker protection
 *
 * @example
 * const safeSpotifyCall = withCircuitBreaker('spotify', spotifyRequest);
 * const result = await safeSpotifyCall('/me');
 */
export function withCircuitBreaker<T extends (...args: unknown[]) => Promise<unknown>>(
  name: string,
  fn: T,
  options?: CircuitBreakerOptions
): T {
  const breaker = getCircuitBreaker(name, options);

  return (async (...args: Parameters<T>): Promise<ReturnType<T>> => {
    return breaker.execute(async () => fn(...args)) as Promise<ReturnType<T>>;
  }) as T;
}

export default CircuitBreaker;
