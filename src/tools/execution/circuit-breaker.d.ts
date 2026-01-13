/**
 * Service Circuit Breaker
 *
 * Prevents hammering slow/failing services by tracking:
 * - Failure counts and rates
 * - Latency patterns
 * - Success rates
 *
 * When a service is consistently slow or failing:
 * 1. Open the circuit (skip the service)
 * 2. Use cached/fallback data instead
 * 3. Periodically try again (half-open state)
 *
 * Philosophy: Don't keep trying something that's broken.
 * Fail fast, serve cached data, and try again later.
 */
import { type CircuitBreakerConfig, type ServiceCircuit } from './types.js';
declare class ServiceCircuitBreaker {
    private circuits;
    private config;
    constructor(config?: Partial<CircuitBreakerConfig>);
    /**
     * Get or create circuit for a service
     */
    private getCircuit;
    /**
     * Check if circuit should be skipped (open or slow)
     */
    shouldSkip(service: string): boolean;
    /**
     * Record a successful execution
     */
    recordSuccess(service: string): void;
    /**
     * Record a failed execution
     */
    recordFailure(service: string): void;
    /**
     * Record latency for a service
     */
    recordLatency(service: string, latencyMs: number): void;
    /**
     * Get current state of a circuit
     */
    getState(service: string): ServiceCircuit;
    /**
     * Get all circuit states
     */
    getAllStates(): ServiceCircuit[];
    /**
     * Manually reset a circuit
     */
    reset(service: string): void;
    /**
     * Reset all circuits
     */
    resetAll(): void;
    /**
     * Get health summary
     */
    getHealthSummary(): {
        healthy: string[];
        degraded: string[];
        unhealthy: string[];
    };
    /**
     * Update configuration
     */
    setConfig(config: Partial<CircuitBreakerConfig>): void;
}
/**
 * Singleton circuit breaker instance
 */
export declare const circuitBreaker: ServiceCircuitBreaker;
export { ServiceCircuitBreaker };
//# sourceMappingURL=circuit-breaker.d.ts.map