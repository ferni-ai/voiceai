/**
 * Cloud Monitoring Metrics
 *
 * Exports circuit breaker and self-healing metrics to Google Cloud Monitoring.
 * Enables dashboards, alerting policies, and SLO tracking.
 *
 * Metrics exported:
 * - circuit_breaker/state (gauge): Current state (0=closed, 1=half_open, 2=open)
 * - circuit_breaker/requests (counter): Total requests through circuit
 * - circuit_breaker/failures (counter): Failed requests
 * - circuit_breaker/success_rate (gauge): Rolling success rate
 * - circuit_breaker/state_changes (counter): Number of state transitions
 * - resilient_http/retries (counter): Retry attempts
 * - resilient_http/latency (distribution): Request latency
 *
 * Setup:
 * 1. Enable Cloud Monitoring API in GCP Console
 * 2. Service account needs roles/monitoring.metricWriter
 * 3. Set GOOGLE_APPLICATION_CREDENTIALS or run on GCP
 */
import type { CircuitState } from './circuit-breaker.js';
export interface MetricPoint {
    name: string;
    value: number;
    labels: Record<string, string>;
    timestamp?: Date;
}
export interface MetricsConfig {
    /** GCP Project ID */
    projectId?: string;
    /** Enable metrics export (default: true in production) */
    enabled?: boolean;
    /** Export interval in ms (default: 60000) */
    exportIntervalMs?: number;
    /** Metric prefix (default: custom.googleapis.com/ferni) */
    metricPrefix?: string;
}
/**
 * Record a metric point (buffered for batch export)
 */
export declare function recordMetric(name: string, value: number, labels?: Record<string, string>): void;
/**
 * Record circuit breaker state
 */
export declare function recordCircuitState(circuitName: string, state: CircuitState, stats?: {
    failures?: number;
    totalRequests?: number;
    totalSuccesses?: number;
    totalFailures?: number;
}): void;
/**
 * Record circuit state change event
 */
export declare function recordStateChange(circuitName: string, oldState: CircuitState, newState: CircuitState): void;
/**
 * Record HTTP request metrics
 */
export declare function recordHttpRequest(serviceName: string, durationMs: number, success: boolean, retries: number): void;
/**
 * Flush buffered metrics to Cloud Monitoring
 */
export declare function flushMetrics(): Promise<number>;
/**
 * Configure metrics export
 */
export declare function configureMetrics(newConfig: Partial<MetricsConfig>): void;
/**
 * Start periodic metrics export
 */
export declare function startMetricsExport(): void;
/**
 * Stop periodic metrics export
 */
export declare function stopMetricsExport(): void;
/**
 * Get current metrics configuration
 */
export declare function getMetricsConfig(): MetricsConfig;
/**
 * Get buffered metric count (for debugging)
 */
export declare function getBufferedMetricCount(): number;
/**
 * Create circuit breaker callbacks that record metrics
 */
export declare function createMetricsCallbacks(): {
    onStateChange: (name: string, oldState: CircuitState, newState: CircuitState) => void;
    onRequest: (name: string, success: boolean, durationMs: number) => void;
};
//# sourceMappingURL=cloud-metrics.d.ts.map