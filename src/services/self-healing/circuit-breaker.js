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
import { createLogger } from '../../utils/safe-logger.js';
const log = createLogger({ module: 'circuit-breaker' });
// Lazy imports to avoid circular dependencies
let alertingHandler = null;
let metricsHandler = null;
// Initialize integrations lazily
async function initializeIntegrations() {
    if (alertingHandler && metricsHandler)
        return;
    try {
        // Load alerting
        const { handleCircuitStateChange } = await import('./circuit-alerting.js');
        alertingHandler = (name, oldState, newState, stats) => {
            handleCircuitStateChange(name, oldState, newState, {
                failures: stats?.failures,
                successRate: stats?.totalRequests
                    ? `${((stats.totalSuccesses / stats.totalRequests) * 100).toFixed(1)}%`
                    : undefined,
            });
        };
    }
    catch {
        // Alerting not available
    }
    try {
        // Load metrics
        const { recordStateChange, recordCircuitState } = await import('./cloud-metrics.js');
        metricsHandler = (name, oldState, newState) => {
            recordStateChange(name, oldState, newState);
            recordCircuitState(name, newState);
        };
    }
    catch {
        // Metrics not available
    }
}
// Trigger initialization (non-blocking)
initializeIntegrations().catch((err) => {
    log.warn({ error: String(err) }, 'Circuit breaker integrations init failed (non-critical)');
});
export class CircuitBreakerError extends Error {
    circuitName;
    state;
    constructor(circuitName, state) {
        super(`Circuit "${circuitName}" is ${state}`);
        this.circuitName = circuitName;
        this.state = state;
        this.name = 'CircuitBreakerError';
    }
}
export class CircuitBreaker {
    name;
    options;
    stats;
    failureTimestamps = [];
    constructor(name, options) {
        this.name = name;
        this.options = options;
        this.stats = {
            state: 'closed',
            failures: 0,
            successes: 0,
            lastFailureTime: null,
            lastStateChange: Date.now(),
            totalRequests: 0,
            totalFailures: 0,
            totalSuccesses: 0,
        };
    }
    get state() {
        return this.stats.state;
    }
    get isOpen() {
        return this.stats.state === 'open';
    }
    get isClosed() {
        return this.stats.state === 'closed';
    }
    /**
     * Execute an operation through the circuit breaker
     */
    async execute(operation) {
        this.stats.totalRequests++;
        // Check if circuit should transition from open to half-open
        if (this.stats.state === 'open') {
            const timeSinceLastFailure = Date.now() - (this.stats.lastFailureTime || 0);
            if (timeSinceLastFailure >= this.options.recoveryTimeout) {
                this.transitionTo('half_open');
            }
            else {
                throw new CircuitBreakerError(this.name, 'open');
            }
        }
        try {
            const result = await operation();
            this.recordSuccess();
            return result;
        }
        catch (error) {
            this.recordFailure();
            throw error;
        }
    }
    /**
     * Record a successful operation
     */
    recordSuccess() {
        this.stats.totalSuccesses++;
        if (this.stats.state === 'half_open') {
            this.stats.successes++;
            if (this.stats.successes >= this.options.successThreshold) {
                this.transitionTo('closed');
            }
        }
        else if (this.stats.state === 'closed') {
            // Reset failure count on success in closed state
            this.stats.failures = 0;
            this.failureTimestamps = [];
        }
    }
    /**
     * Record a failed operation
     */
    recordFailure() {
        this.stats.totalFailures++;
        this.stats.lastFailureTime = Date.now();
        if (this.stats.state === 'half_open') {
            // Any failure in half-open goes back to open
            this.transitionTo('open');
        }
        else if (this.stats.state === 'closed') {
            // Track failure in window
            const now = Date.now();
            this.failureTimestamps.push(now);
            // Remove old failures outside window
            const windowStart = now - this.options.failureWindow;
            this.failureTimestamps = this.failureTimestamps.filter((t) => t >= windowStart);
            this.stats.failures = this.failureTimestamps.length;
            if (this.stats.failures >= this.options.failureThreshold) {
                this.transitionTo('open');
            }
        }
    }
    /**
     * Transition to a new state
     */
    transitionTo(newState) {
        const oldState = this.stats.state;
        if (oldState === newState)
            return;
        log.info({ circuitName: this.name, oldState, newState }, `Circuit breaker state change: ${oldState} → ${newState}`);
        this.stats.state = newState;
        this.stats.lastStateChange = Date.now();
        // Reset counters on state change
        if (newState === 'half_open') {
            this.stats.successes = 0;
        }
        else if (newState === 'closed') {
            this.stats.failures = 0;
            this.stats.successes = 0;
            this.failureTimestamps = [];
        }
        // Custom callback
        if (this.options.onStateChange) {
            this.options.onStateChange(this.name, oldState, newState);
        }
        // Auto-wired integrations (non-blocking)
        const stats = this.stats;
        // Send alerts for significant state changes
        if (alertingHandler) {
            try {
                alertingHandler(this.name, oldState, newState, stats);
            }
            catch {
                // Don't let alerting failures affect circuit operation
            }
        }
        // Record metrics
        if (metricsHandler) {
            try {
                metricsHandler(this.name, oldState, newState);
            }
            catch {
                // Don't let metrics failures affect circuit operation
            }
        }
    }
    /**
     * Get circuit statistics
     */
    getStats() {
        return { name: this.name, ...this.stats };
    }
    /**
     * Manually reset the circuit to closed state
     */
    reset() {
        this.transitionTo('closed');
    }
    /**
     * Manually trip the circuit to open state
     */
    trip() {
        this.transitionTo('open');
    }
}
// Registry of circuit breakers
const circuits = new Map();
/**
 * Create or get a circuit breaker by name
 */
export function createCircuitBreaker(name, options = {}) {
    if (circuits.has(name)) {
        return circuits.get(name);
    }
    const circuit = new CircuitBreaker(name, {
        failureThreshold: options.failureThreshold ?? 5,
        recoveryTimeout: options.recoveryTimeout ?? 30000,
        successThreshold: options.successThreshold ?? 2,
        failureWindow: options.failureWindow ?? 60000,
        onStateChange: options.onStateChange ??
            ((n, o, s) => {
                // Default: log to e2e diagnostics if available
                process.stderr.write(`[circuit-breaker] ${n}: ${o} → ${s}\n`);
            }),
    });
    circuits.set(name, circuit);
    return circuit;
}
/**
 * Get all circuit breaker stats
 */
export function getAllCircuitStats() {
    return Array.from(circuits.values()).map((c) => c.getStats());
}
//# sourceMappingURL=circuit-breaker.js.map