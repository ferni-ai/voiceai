/**
 * Context Builder Metrics & Observability
 *
 * Tracks performance and usage of context builders for:
 * - Performance optimization (which builders are slow?)
 * - Debugging (which builders fired for this turn?)
 * - Analytics (which builders produce the most value?)
 *
 * @module intelligence/context-builders/metrics
 */
export interface BuilderMetrics {
    /** Builder name */
    name: string;
    /** Number of times called */
    callCount: number;
    /** Total execution time in ms */
    totalDurationMs: number;
    /** Average execution time in ms */
    avgDurationMs: number;
    /** Number of injections produced */
    injectionsProduced: number;
    /** Times the builder returned empty array */
    skipCount: number;
    /** Times the builder threw an error */
    errorCount: number;
    /** Last time the builder was called */
    lastCallTimestamp?: Date;
    /** Last execution duration */
    lastDurationMs?: number;
    /** Last number of injections */
    lastInjectionsCount?: number;
}
export interface TurnMetrics {
    /** Turn number */
    turnNumber: number;
    /** Session ID */
    sessionId: string;
    /** Total time to build all context */
    totalDurationMs: number;
    /** Number of builders that ran */
    buildersRan: number;
    /** Number of builders that produced injections */
    buildersProducedInjections: number;
    /** Total injections produced */
    totalInjections: number;
    /** Per-builder breakdown */
    builderBreakdown: Array<{
        name: string;
        durationMs: number;
        injectionCount: number;
        skipped: boolean;
        error?: string;
    }>;
    /** Timestamp */
    timestamp: Date;
}
export interface MetricsSummary {
    /** Total builds across all sessions */
    totalBuilds: number;
    /** Average build time */
    avgBuildTimeMs: number;
    /** Slowest builders */
    slowestBuilders: Array<{
        name: string;
        avgMs: number;
    }>;
    /** Most active builders (produce most injections) */
    mostActiveBuilders: Array<{
        name: string;
        avgInjections: number;
    }>;
    /** Highest skip rate builders */
    highestSkipRate: Array<{
        name: string;
        skipRate: number;
    }>;
    /** Error-prone builders */
    errorProneBuilders: Array<{
        name: string;
        errorRate: number;
    }>;
}
/**
 * Record metrics for a builder execution
 */
export declare function recordBuilderMetrics(name: string, durationMs: number, injectionCount: number, error?: Error): void;
/**
 * Record metrics for an entire turn
 */
export declare function recordTurnMetrics(sessionId: string, turnNumber: number, builderResults: Array<{
    name: string;
    durationMs: number;
    injectionCount: number;
    error?: string;
}>): TurnMetrics;
/**
 * Get metrics for a specific builder
 */
export declare function getBuilderMetrics(name: string): BuilderMetrics | undefined;
/**
 * Get metrics for all builders
 */
export declare function getAllBuilderMetrics(): BuilderMetrics[];
/**
 * Get recent turn metrics
 */
export declare function getRecentTurnMetrics(limit?: number): TurnMetrics[];
/**
 * Get metrics summary
 */
export declare function getMetricsSummary(): MetricsSummary;
/**
 * Get metrics for a specific session
 */
export declare function getSessionMetrics(sessionId: string): {
    turns: TurnMetrics[];
    avgDurationMs: number;
    totalInjections: number;
};
/**
 * Reset all metrics (for testing)
 */
export declare function resetAllMetrics(): void;
/**
 * Reset metrics for a specific builder
 */
export declare function resetBuilderMetrics(name: string): void;
/**
 * Check for performance issues and return warnings
 */
export declare function checkPerformanceIssues(): string[];
declare const _default: {
    recordBuilderMetrics: typeof recordBuilderMetrics;
    recordTurnMetrics: typeof recordTurnMetrics;
    getBuilderMetrics: typeof getBuilderMetrics;
    getAllBuilderMetrics: typeof getAllBuilderMetrics;
    getRecentTurnMetrics: typeof getRecentTurnMetrics;
    getMetricsSummary: typeof getMetricsSummary;
    getSessionMetrics: typeof getSessionMetrics;
    resetAllMetrics: typeof resetAllMetrics;
    resetBuilderMetrics: typeof resetBuilderMetrics;
    checkPerformanceIssues: typeof checkPerformanceIssues;
};
export default _default;
//# sourceMappingURL=metrics.d.ts.map