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
let stateChangeCallback = null;
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
export function registerCircuitBreakerCallback(callback) {
    stateChangeCallback = callback;
}
/**
 * Clear the registered callback (for testing).
 */
export function clearCircuitBreakerCallback() {
    stateChangeCallback = null;
}
// ============================================================================
// CIRCUIT BREAKER CLASS
// ============================================================================
export class CircuitBreaker {
    name;
    failureThreshold;
    resetTimeout;
    successThreshold;
    state = 'closed';
    failures = 0;
    successes = 0;
    lastFailure;
    lastSuccess;
    nextAttempt;
    totalCalls = 0;
    totalFailures = 0;
    constructor(name, options = {}) {
        this.name = name;
        this.failureThreshold = options.failureThreshold ?? 5;
        this.resetTimeout = options.resetTimeout ?? 30000;
        this.successThreshold = options.successThreshold ?? 2;
    }
    /**
     * Execute a function through the circuit breaker
     */
    async execute(fn) {
        this.totalCalls++;
        // Check if circuit is open
        if (this.state === 'open') {
            if (this.nextAttempt && new Date() >= this.nextAttempt) {
                // Try half-open state
                this.state = 'half-open';
                getLogger().info({ name: this.name }, 'Circuit breaker entering half-open state');
            }
            else {
                const waitMs = this.nextAttempt
                    ? this.nextAttempt.getTime() - Date.now()
                    : this.resetTimeout;
                throw new CircuitOpenError(`Circuit breaker "${this.name}" is OPEN. Service unavailable. Retry in ${Math.ceil(waitMs / 1000)}s`);
            }
        }
        try {
            const result = await fn();
            this.onSuccess();
            return result;
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.onFailure(errorMessage);
            throw error;
        }
    }
    /**
     * Check if a request can be made (doesn't execute anything)
     */
    canRequest() {
        if (this.state === 'closed')
            return true;
        if (this.state === 'half-open')
            return true;
        if (this.state === 'open' && this.nextAttempt && new Date() >= this.nextAttempt) {
            return true;
        }
        return false;
    }
    /**
     * Get current stats
     */
    getStats() {
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
    reset() {
        this.state = 'closed';
        this.failures = 0;
        this.successes = 0;
        this.nextAttempt = undefined;
        getLogger().info({ name: this.name }, 'Circuit breaker manually reset');
    }
    onSuccess() {
        this.lastSuccess = new Date();
        this.successes++;
        if (this.state === 'half-open') {
            if (this.successes >= this.successThreshold) {
                this.state = 'closed';
                this.failures = 0;
                this.successes = 0;
                getLogger().info({ name: this.name }, 'Circuit breaker CLOSED (service recovered)');
                // Report state change via callback (if registered)
                stateChangeCallback?.(this.name, 'closed', this.failures, this.successes, undefined);
            }
        }
        else {
            // Reset failure count on success in closed state
            this.failures = 0;
        }
    }
    onFailure(reason) {
        this.lastFailure = new Date();
        this.failures++;
        this.totalFailures++;
        if (this.state === 'half-open') {
            // Single failure in half-open goes back to open
            this.state = 'open';
            this.nextAttempt = new Date(Date.now() + this.resetTimeout);
            this.successes = 0;
            getLogger().warn({ name: this.name, nextAttempt: this.nextAttempt }, 'Circuit breaker OPEN (half-open test failed)');
            // Report state change via callback (if registered)
            stateChangeCallback?.(this.name, 'open', this.failures, this.successes, reason || 'half-open test failed');
        }
        else if (this.failures >= this.failureThreshold) {
            this.state = 'open';
            this.nextAttempt = new Date(Date.now() + this.resetTimeout);
            getLogger().warn({ name: this.name, failures: this.failures, nextAttempt: this.nextAttempt }, 'Circuit breaker OPEN (failure threshold reached)');
            // Report state change via callback (if registered)
            stateChangeCallback?.(this.name, 'open', this.failures, this.successes, reason || 'failure threshold reached');
        }
    }
}
// ============================================================================
// CUSTOM ERROR
// ============================================================================
export class CircuitOpenError extends Error {
    constructor(message) {
        super(message);
        this.name = 'CircuitOpenError';
    }
}
// ============================================================================
// CIRCUIT BREAKER REGISTRY
// ============================================================================
const breakers = new Map();
/**
 * Get or create a circuit breaker by name
 */
export function getCircuitBreaker(name, options) {
    let breaker = breakers.get(name);
    if (!breaker) {
        breaker = new CircuitBreaker(name, options);
        breakers.set(name, breaker);
    }
    return breaker;
}
// ============================================================================
// REDIS-BACKED CIRCUIT BREAKER (Cross-Instance State Sharing)
// ============================================================================
/**
 * Get or create a Redis-backed circuit breaker.
 * Redis backing enables circuit state to be shared across all instances.
 * When one instance trips a breaker, ALL instances see it immediately.
 *
 * Use for high-traffic external APIs where you want coordinated failure handling.
 *
 * @example
 * const breaker = await getRedisCircuitBreakerAsync('openai-api', {
 *   failureThreshold: 5,
 *   resetTimeout: 30000,
 * });
 * const result = await breaker.execute(() => callOpenAI());
 */
export async function getRedisCircuitBreakerAsync(name, options) {
    // Check if already exists as Redis breaker
    const existing = breakers.get(`redis:${name}`);
    if (existing) {
        return existing;
    }
    try {
        // Try to create Redis-backed breaker
        const { createRedisCircuitBreaker } = await import('../services/self-healing/redis-circuit-breaker.js');
        const redisBreaker = createRedisCircuitBreaker(name, {
            failureThreshold: options?.failureThreshold ?? 5,
            recoveryTimeout: options?.resetTimeout ?? 30000,
            successThreshold: options?.successThreshold ?? 2,
            syncIntervalMs: options?.syncIntervalMs ?? 5000,
        });
        // Store in breakers map - the RedisCircuitBreaker has compatible execute() method
        // but we don't add it to breakers since it uses a different base class
        getLogger().debug({ name }, 'Created Redis-backed circuit breaker');
        return redisBreaker;
    }
    catch {
        // Fall back to local circuit breaker if Redis not available
        getLogger().debug({ name }, 'Redis not available, using local circuit breaker');
        return getCircuitBreaker(name, options);
    }
}
/**
 * Get all circuit breaker stats (for monitoring)
 */
export function getAllCircuitBreakerStats() {
    return Array.from(breakers.values()).map((b) => b.getStats());
}
/**
 * Reset all circuit breakers (for testing)
 */
export function resetAllCircuitBreakers() {
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
export function withCircuitBreaker(name, fn, options) {
    const breaker = getCircuitBreaker(name, options);
    return (async (...args) => {
        return breaker.execute(async () => fn(...args));
    });
}
export default CircuitBreaker;
//# sourceMappingURL=circuit-breaker.js.map