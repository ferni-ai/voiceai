/**
 * Performance Profiler
 *
 * Monitors and optimizes voice response latency.
 * Target: < 200ms end-to-end response time.
 *
 * Key metrics:
 * - Time to First Token (TTFT)
 * - Time to First Audio (TTFA)
 * - Total Response Time (TRT)
 * - LLM API latency
 * - TTS latency
 */
interface TimingMark {
    name: string;
    timestamp: number;
    duration?: number;
}
interface PerformanceTrace {
    traceId: string;
    sessionId: string;
    startTime: number;
    endTime?: number;
    marks: TimingMark[];
    metadata: Record<string, unknown>;
}
interface PerformanceStats {
    count: number;
    mean: number;
    p50: number;
    p90: number;
    p99: number;
    min: number;
    max: number;
}
interface LatencyReport {
    period: string;
    totalRequests: number;
    timeToFirstToken: PerformanceStats;
    timeToFirstAudio: PerformanceStats;
    totalResponseTime: PerformanceStats;
    llmLatency: PerformanceStats;
    ttsLatency: PerformanceStats;
    sttLatency: PerformanceStats;
    slowRequests: Array<{
        traceId: string;
        totalTime: number;
        breakdown: Record<string, number>;
    }>;
}
declare class PerformanceProfiler {
    private traces;
    private completedTraces;
    private readonly maxStoredTraces;
    private readonly slowThresholdMs;
    /**
     * Start a new performance trace
     */
    startTrace(traceId: string, sessionId: string, metadata?: Record<string, unknown>): void;
    /**
     * Add a timing mark to an active trace
     */
    mark(traceId: string, name: string): void;
    /**
     * End a trace and store results
     */
    endTrace(traceId: string): PerformanceTrace | null;
    /**
     * Get timing between two marks
     */
    getInterval(traceId: string, startMark: string, endMark: string): number | null;
    /**
     * Calculate statistics for an array of values
     */
    private calculateStats;
    /**
     * Generate a latency report for a time period
     */
    generateReport(periodMs?: number): LatencyReport;
    /**
     * Get optimization suggestions based on metrics
     */
    getOptimizationSuggestions(): string[];
    /**
     * Clear stored traces
     */
    reset(): void;
}
export declare const performanceProfiler: PerformanceProfiler;
/**
 * Helper to time an async function
 */
export declare function withTiming<T>(traceId: string, markName: string, fn: () => Promise<T>): Promise<T>;
/**
 * Decorator for timing class methods
 */
export declare function Timed(markName: string): (target: unknown, propertyKey: string, descriptor: PropertyDescriptor) => PropertyDescriptor;
export default performanceProfiler;
//# sourceMappingURL=performance-profiler.d.ts.map