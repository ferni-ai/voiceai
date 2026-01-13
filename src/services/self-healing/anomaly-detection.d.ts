/**
 * Anomaly Detection for Predictive Failure Prevention
 *
 * Monitors metrics in real-time and detects anomalies before they cause failures.
 * Uses statistical methods (z-score, moving average) for lightweight detection.
 *
 * Features:
 * - Rolling window statistics for each metric
 * - Z-score based anomaly detection (> 3 standard deviations)
 * - Trend detection (consistent degradation)
 * - Early warning alerts before circuit breakers trip
 *
 * Monitored signals:
 * - Latency spikes
 * - Error rate increases
 * - Success rate drops
 * - Request volume anomalies
 */
export interface MetricWindow {
    name: string;
    values: number[];
    timestamps: number[];
    mean: number;
    stdDev: number;
    min: number;
    max: number;
    lastAnomalyTime: number | null;
}
export interface AnomalyConfig {
    /** Window size for rolling statistics (default: 100) */
    windowSize?: number;
    /** Z-score threshold for anomaly detection (default: 3) */
    zScoreThreshold?: number;
    /** Minimum samples before detecting anomalies (default: 20) */
    minSamples?: number;
    /** Cooldown between anomaly alerts for same metric (ms, default: 60000) */
    anomalyCooldownMs?: number;
    /** Enable trend detection (default: true) */
    enableTrendDetection?: boolean;
    /** Callback when anomaly detected */
    onAnomaly?: (anomaly: Anomaly) => void;
}
export interface Anomaly {
    metricName: string;
    value: number;
    zScore: number;
    mean: number;
    stdDev: number;
    timestamp: Date;
    type: 'spike' | 'drop' | 'trend';
    severity: 'warning' | 'critical';
    message: string;
}
export interface TrendAnalysis {
    direction: 'improving' | 'degrading' | 'stable';
    strength: number;
    changePercent: number;
}
/**
 * Record a metric value and check for anomalies.
 * Returns anomaly if detected, null otherwise.
 */
export declare function recordAndDetect(metricName: string, value: number, options?: {
    suppressAlerts?: boolean;
}): Anomaly | null;
/**
 * Record latency for a service
 */
export declare function recordLatency(serviceName: string, latencyMs: number): Anomaly | null;
/**
 * Record error rate for a service (0-100)
 */
export declare function recordErrorRate(serviceName: string, errorRatePercent: number): Anomaly | null;
/**
 * Record success rate for a service (0-100)
 */
export declare function recordSuccessRate(serviceName: string, successRatePercent: number): Anomaly | null;
/**
 * Record request count (for volume anomalies)
 */
export declare function recordRequestVolume(serviceName: string, requestCount: number): Anomaly | null;
/**
 * Configure anomaly detection
 */
export declare function configureAnomalyDetection(newConfig: Partial<AnomalyConfig>): void;
/**
 * Get current configuration
 */
export declare function getAnomalyConfig(): AnomalyConfig;
/**
 * Get statistics for a metric
 */
export declare function getMetricStats(metricName: string): MetricWindow | undefined;
/**
 * Get all monitored metrics
 */
export declare function getAllMetricStats(): MetricWindow[];
/**
 * Get recent anomalies
 */
export declare function getRecentAnomalies(limit?: number): Anomaly[];
/**
 * Get anomaly history for dashboard display.
 * Returns data points suitable for graphing.
 */
export interface AnomalyHistoryPoint {
    timestamp: string;
    metric: string;
    value: number;
    mean: number;
    max: number;
    zScore: number;
    isAnomaly: boolean;
}
export declare function getAnomalyHistory(windowMinutes?: number): AnomalyHistoryPoint[];
/**
 * Get anomalies for a specific metric
 */
export declare function getMetricAnomalies(metricName: string, limit?: number): Anomaly[];
/**
 * Clear all state (for testing)
 */
export declare function resetAnomalyDetection(): void;
/**
 * Create an integration that predicts circuit breaker trips.
 * Call this when creating resilient HTTP clients.
 */
export declare function createPredictiveMonitor(serviceName: string): {
    onRequest: (durationMs: number, success: boolean) => void;
    checkHealth: () => {
        healthy: boolean;
        warnings: string[];
    };
};
/**
 * Default anomaly handler that sends alerts for critical anomalies
 */
export declare function createAlertingAnomalyHandler(): (anomaly: Anomaly) => void;
//# sourceMappingURL=anomaly-detection.d.ts.map