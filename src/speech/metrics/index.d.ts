/**
 * Speech Pipeline Metrics & Observability
 *
 * Provides metrics collection and observability for the speech pipeline:
 * - Latency tracking for analysis operations
 * - Quality metrics for emotion detection
 * - Usage metrics for session management
 * - Performance tracking over time
 *
 * @module speech/metrics
 */
export interface LatencyMetrics {
    /** Average analysis latency in ms */
    avgAnalysisLatencyMs: number;
    /** P50 latency in ms */
    p50LatencyMs: number;
    /** P95 latency in ms */
    p95LatencyMs: number;
    /** P99 latency in ms */
    p99LatencyMs: number;
    /** Maximum latency in ms */
    maxLatencyMs: number;
    /** Total number of samples */
    sampleCount: number;
}
export interface QualityMetrics {
    /** Average emotion detection confidence (0-1) */
    avgEmotionConfidence: number;
    /** Percentage of analyses with high confidence (>0.7) */
    highConfidenceRate: number;
    /** Backchannel timing accuracy (0-1) */
    backchannelAccuracy: number;
    /** Turn prediction accuracy (0-1) */
    turnPredictionAccuracy: number;
    /** Number of quality samples */
    sampleCount: number;
}
export interface UsageMetrics {
    /** Number of currently active sessions */
    activeSessionCount: number;
    /** Total sessions created */
    totalSessionsCreated: number;
    /** Total sessions cleaned up successfully */
    totalSessionsCleaned: number;
    /** Cleanup failure count */
    cleanupFailures: number;
    /** Average session duration in seconds */
    avgSessionDurationSec: number;
    /** Longest session duration in seconds */
    maxSessionDurationSec: number;
}
export interface OperationMetrics {
    /** Operation name */
    operation: string;
    /** Number of invocations */
    invocations: number;
    /** Number of successes */
    successes: number;
    /** Number of failures */
    failures: number;
    /** Average duration in ms */
    avgDurationMs: number;
    /** Last invocation timestamp */
    lastInvoked: number;
}
export interface SpeechPipelineMetrics {
    /** Latency metrics */
    latency: LatencyMetrics;
    /** Quality metrics */
    quality: QualityMetrics;
    /** Usage metrics */
    usage: UsageMetrics;
    /** Per-operation metrics */
    operations: Map<string, OperationMetrics>;
    /** Metrics collection start time */
    startTime: number;
    /** Last reset time */
    lastReset: number;
}
export interface MetricsSnapshot {
    /** Timestamp of snapshot */
    timestamp: number;
    /** Uptime in seconds */
    uptimeSec: number;
    /** All metrics */
    metrics: Omit<SpeechPipelineMetrics, 'operations'> & {
        operations: Record<string, OperationMetrics>;
    };
}
/**
 * Record a latency sample for an operation
 */
export declare function recordLatency(operation: string, latencyMs: number): void;
/**
 * Record an emotion detection confidence score
 */
export declare function recordEmotionConfidence(confidence: number): void;
/**
 * Record whether a backchannel was well-timed
 */
export declare function recordBackchannelTiming(wasTimely: boolean): void;
/**
 * Record whether a turn prediction was correct
 */
export declare function recordTurnPredictionAccuracy(wasCorrect: boolean): void;
/**
 * Record a session start
 */
export declare function recordSessionStart(sessionId: string): void;
/**
 * Record a session end
 */
export declare function recordSessionEnd(sessionId: string, success?: boolean): void;
/**
 * Record an operation execution
 */
export declare function recordOperation(name: string, durationMs: number, success?: boolean): void;
/**
 * Get current latency metrics
 */
export declare function getLatencyMetrics(): LatencyMetrics;
/**
 * Get current quality metrics
 */
export declare function getQualityMetrics(): QualityMetrics;
/**
 * Get current usage metrics
 */
export declare function getUsageMetrics(): UsageMetrics;
/**
 * Get all speech pipeline metrics
 */
export declare function getSpeechMetrics(): SpeechPipelineMetrics;
/**
 * Get a JSON-serializable snapshot of all metrics
 */
export declare function getSpeechMetricsSnapshot(): MetricsSnapshot;
/**
 * Reset all metrics
 */
export declare function resetSpeechMetrics(): void;
/**
 * Create a timing wrapper for measuring operation duration
 *
 * @example
 * ```typescript
 * const result = await withTiming('humanListening.analyze', async () => {
 *   return await pipeline.analyze(context);
 * });
 * ```
 */
export declare function withTiming<T>(operationName: string, fn: () => Promise<T>): Promise<T>;
/**
 * Create a sync timing wrapper
 */
export declare function withTimingSync<T>(operationName: string, fn: () => T): T;
declare const _default: {
    recordLatency: typeof recordLatency;
    recordEmotionConfidence: typeof recordEmotionConfidence;
    recordBackchannelTiming: typeof recordBackchannelTiming;
    recordTurnPredictionAccuracy: typeof recordTurnPredictionAccuracy;
    recordSessionStart: typeof recordSessionStart;
    recordSessionEnd: typeof recordSessionEnd;
    recordOperation: typeof recordOperation;
    getLatencyMetrics: typeof getLatencyMetrics;
    getQualityMetrics: typeof getQualityMetrics;
    getUsageMetrics: typeof getUsageMetrics;
    getSpeechMetrics: typeof getSpeechMetrics;
    getSpeechMetricsSnapshot: typeof getSpeechMetricsSnapshot;
    resetSpeechMetrics: typeof resetSpeechMetrics;
    withTiming: typeof withTiming;
    withTimingSync: typeof withTimingSync;
};
export default _default;
//# sourceMappingURL=index.d.ts.map