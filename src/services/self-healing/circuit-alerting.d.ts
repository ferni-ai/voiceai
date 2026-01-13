/**
 * Circuit Breaker Alerting
 *
 * Sends notifications when circuit breakers change state:
 * - CLOSED → OPEN: Alert! Service is failing
 * - OPEN → HALF_OPEN: Service is recovering
 * - HALF_OPEN → CLOSED: Recovery complete
 * - HALF_OPEN → OPEN: Recovery failed
 *
 * Integrates with:
 * - Slack webhooks for real-time alerts
 * - Email for critical incidents
 * - In-memory event log for debugging
 */
import type { CircuitState } from './circuit-breaker.js';
export interface CircuitEvent {
    circuitName: string;
    oldState: CircuitState;
    newState: CircuitState;
    timestamp: Date;
    details?: {
        failures?: number;
        lastError?: string;
        successRate?: string;
    };
}
export interface AlertConfig {
    /** Slack webhook URL for alerts */
    slackWebhookUrl?: string;
    /** Email for critical alerts */
    alertEmail?: string;
    /** Minimum time between alerts for same circuit (ms) */
    alertCooldownMs?: number;
    /** Enable verbose logging */
    verbose?: boolean;
    /** Custom alert handler */
    onAlert?: (event: CircuitEvent, severity: AlertSeverity) => void;
}
export type AlertSeverity = 'info' | 'warning' | 'critical';
/**
 * Handle circuit breaker state change.
 * Call this from circuit breaker's onStateChange callback.
 */
export declare function handleCircuitStateChange(circuitName: string, oldState: CircuitState, newState: CircuitState, details?: CircuitEvent['details']): Promise<void>;
/**
 * Configure circuit breaker alerting
 */
export declare function configureAlerting(newConfig: Partial<AlertConfig>): void;
/**
 * Get current alerting configuration (for testing)
 */
export declare function getAlertConfig(): AlertConfig;
/**
 * Get recent circuit events for debugging
 */
export declare function getRecentEvents(limit?: number): CircuitEvent[];
/**
 * Get events for a specific circuit
 */
export declare function getCircuitEvents(circuitName: string, limit?: number): CircuitEvent[];
/**
 * Clear event history (for testing)
 */
export declare function clearEventHistory(): void;
/**
 * Create an onStateChange callback for circuit breakers that sends alerts
 */
export declare function createAlertingCallback(getStats?: (name: string) => {
    failures: number;
    totalRequests: number;
    totalSuccesses: number;
} | undefined): (name: string, oldState: CircuitState, newState: CircuitState) => void;
//# sourceMappingURL=circuit-alerting.d.ts.map