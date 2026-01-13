/**
 * Circuit Breaker Pattern
 *
 * Prevents cascading failures by "tripping" after repeated failures
 * and allowing the system to recover gracefully.
 *
 * States:
 * - CLOSED: Normal operation, requests flow through
 * - OPEN: Circuit tripped, requests fail immediately
 * - HALF_OPEN: Testing if service recovered
 *
 * Integrations (auto-wired):
 * - Alerting: Slack/email on state changes
 * - Metrics: GCP Cloud Monitoring export
 * - Anomaly Detection: Predictive failure prevention
 */
export type CircuitState = 'closed' | 'open' | 'half_open';
export interface CircuitBreakerOptions {
    /** Number of failures before opening circuit (default: 5) */
    failureThreshold?: number;
    /** Time in ms to wait before trying half-open (default: 30000) */
    recoveryTimeout?: number;
    /** Number of successes needed to close circuit from half-open (default: 2) */
    successThreshold?: number;
    /** Time window in ms for counting failures (default: 60000) */
    failureWindow?: number;
    /** Callback when circuit state changes */
    onStateChange?: (name: string, oldState: CircuitState, newState: CircuitState) => void;
}
interface CircuitStats {
    state: CircuitState;
    failures: number;
    successes: number;
    lastFailureTime: number | null;
    lastStateChange: number;
    totalRequests: number;
    totalFailures: number;
    totalSuccesses: number;
}
export declare class CircuitBreakerError extends Error {
    readonly circuitName: string;
    readonly state: CircuitState;
    constructor(circuitName: string, state: CircuitState);
}
export declare class CircuitBreaker {
    readonly name: string;
    private options;
    private stats;
    private failureTimestamps;
    constructor(name: string, options: Required<CircuitBreakerOptions>);
    get state(): CircuitState;
    get isOpen(): boolean;
    get isClosed(): boolean;
    /**
     * Execute an operation through the circuit breaker
     */
    execute<T>(operation: () => Promise<T>): Promise<T>;
    /**
     * Record a successful operation
     */
    private recordSuccess;
    /**
     * Record a failed operation
     */
    private recordFailure;
    /**
     * Transition to a new state
     */
    private transitionTo;
    /**
     * Get circuit statistics
     */
    getStats(): CircuitStats & {
        name: string;
    };
    /**
     * Manually reset the circuit to closed state
     */
    reset(): void;
    /**
     * Manually trip the circuit to open state
     */
    trip(): void;
}
/**
 * Create or get a circuit breaker by name
 */
export declare function createCircuitBreaker(name: string, options?: CircuitBreakerOptions): CircuitBreaker;
/**
 * Get all circuit breaker stats
 */
export declare function getAllCircuitStats(): Array<CircuitStats & {
    name: string;
}>;
export {};
//# sourceMappingURL=circuit-breaker.d.ts.map