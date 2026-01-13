/**
 * Orchestrator Metrics & Analytics
 *
 * Tracks performance, feature application rates, and provides insights
 * for monitoring and optimization.
 *
 * Metrics tracked:
 * - Phase timing (analysis, intelligence, humanization, output)
 * - Feature application rates
 * - Confidence distributions
 * - Error rates
 * - Cache hit rates
 *
 * @module @ferni/conversation/orchestrator/metrics
 */
export interface PhaseMetrics {
    count: number;
    totalMs: number;
    minMs: number;
    maxMs: number;
    avgMs: number;
    p50Ms: number;
    p95Ms: number;
    p99Ms: number;
}
export interface FeatureMetrics {
    applied: number;
    skipped: number;
    errors: number;
    applicationRate: number;
}
export interface OrchestratorMetrics {
    sessionId: string;
    personaId: string;
    startTime: number;
    lastUpdate: number;
    totalOrchestrations: number;
    totalErrors: number;
    errorRate: number;
    phases: {
        analysis: PhaseMetrics;
        intelligence: PhaseMetrics;
        humanization: PhaseMetrics;
        output: PhaseMetrics;
        total: PhaseMetrics;
    };
    features: Record<string, FeatureMetrics>;
    confidence: {
        analysis: {
            sum: number;
            count: number;
            avg: number;
        };
        intelligence: {
            sum: number;
            count: number;
            avg: number;
        };
        overall: {
            sum: number;
            count: number;
            avg: number;
        };
    };
    cache: {
        hits: number;
        misses: number;
        hitRate: number;
    };
}
export interface MetricsSnapshot {
    timestamp: number;
    metrics: OrchestratorMetrics;
    recentTimings: Array<{
        turn: number;
        timing: Record<string, number>;
    }>;
}
declare class MetricsCollector {
    private metrics;
    private timingHistory;
    private readonly maxHistorySize;
    constructor(sessionId: string, personaId: string);
    private createEmptyMetrics;
    /**
     * Record timing for an orchestration
     */
    recordTiming(timing: {
        analysis: number;
        intelligence: number;
        humanization: number;
        output: number;
        total: number;
    }): void;
    private updatePhaseMetrics;
    private recalculatePercentiles;
    private percentile;
    /**
     * Record feature application
     */
    recordFeature(featureName: string, applied: boolean, error?: boolean): void;
    /**
     * Record multiple features at once
     */
    recordFeatures(appliedFeatures: string[], skippedFeatures?: Array<{
        name: string;
    }>): void;
    /**
     * Record an error
     */
    recordError(phase?: string): void;
    /**
     * Record confidence scores
     */
    recordConfidence(scores: {
        analysis: number;
        intelligence: number;
        overall: number;
    }): void;
    private updateConfidence;
    /**
     * Record cache hit/miss
     */
    recordCacheHit(hit: boolean): void;
    /**
     * Get current metrics
     */
    getMetrics(): OrchestratorMetrics;
    /**
     * Get a snapshot with recent history
     */
    getSnapshot(): MetricsSnapshot;
    /**
     * Get summary for logging
     */
    getSummary(): {
        totalOrchestrations: number;
        avgTotalMs: number;
        p95TotalMs: number;
        errorRate: number;
        topFeatures: Array<{
            name: string;
            rate: number;
        }>;
        avgConfidence: number;
    };
    /**
     * Check if orchestration is slow
     */
    isSlowOrchestration(totalMs: number): boolean;
    /**
     * Reset metrics
     */
    reset(): void;
}
/**
 * Get or create metrics collector for a session
 */
export declare function getMetricsCollector(sessionId: string, personaId?: string): MetricsCollector;
/**
 * Reset metrics for a session
 */
export declare function resetMetrics(sessionId: string): void;
/**
 * Reset all metrics
 */
export declare function resetAllMetrics(): void;
/**
 * Get aggregated metrics across all sessions
 */
export declare function getAggregatedMetrics(): {
    activeSessions: number;
    totalOrchestrations: number;
    avgTotalMs: number;
    errorRate: number;
    featureRates: Record<string, number>;
};
/**
 * Log metrics summary at info level
 */
export declare function logMetricsSummary(sessionId: string): void;
/**
 * Log slow orchestration warning
 */
export declare function logSlowOrchestration(sessionId: string, timing: Record<string, number>, turn: number): void;
export type { MetricsCollector };
//# sourceMappingURL=metrics.d.ts.map