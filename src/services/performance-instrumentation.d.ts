/**
 * Performance Instrumentation Service
 *
 * Tracks memory usage, startup timings, and tool loading metrics.
 * Use this to understand the runtime footprint of the voice agent.
 *
 * USAGE:
 *   import { perfInstrumentation } from './performance-instrumentation.js';
 *
 *   // Track a phase
 *   perfInstrumentation.startPhase('tool-init');
 *   await initializeTools();
 *   perfInstrumentation.endPhase('tool-init');
 *
 *   // Snapshot memory
 *   perfInstrumentation.snapshotMemory('after-tool-init');
 *
 *   // Get report
 *   const report = perfInstrumentation.getReport();
 */
export interface MemoryAlertConfig {
    /** Warning threshold in MB (default: 1024 = 1GB) */
    warningThresholdMB: number;
    /** Critical threshold in MB (default: 1536 = 1.5GB) */
    criticalThresholdMB: number;
    /** How often to check memory in ms (default: 30000 = 30s) */
    checkIntervalMs: number;
    /** Enable automatic periodic checks */
    enableAutoCheck: boolean;
}
export interface MemoryAlert {
    id: string;
    level: 'warning' | 'critical';
    heapUsedMB: number;
    thresholdMB: number;
    message: string;
    timestamp: Date;
    acknowledged: boolean;
}
export interface MemorySnapshot {
    timestamp: Date;
    label: string;
    heapUsedMB: number;
    heapTotalMB: number;
    rssMB: number;
    externalMB: number;
    arrayBuffersMB: number;
}
export interface PhaseTimng {
    name: string;
    startTime: number;
    endTime?: number;
    durationMs?: number;
    metadata?: Record<string, unknown>;
}
export interface ToolLoadMetrics {
    domain: string;
    toolCount: number;
    loadTimeMs: number;
    loadedAt: Date;
}
export interface PerformanceReport {
    startupTime: Date;
    currentTime: Date;
    uptimeMs: number;
    memory: {
        current: MemorySnapshot;
        peak: MemorySnapshot;
        snapshots: MemorySnapshot[];
    };
    phases: PhaseTimng[];
    toolLoading: {
        totalDomains: number;
        totalTools: number;
        totalLoadTimeMs: number;
        byDomain: ToolLoadMetrics[];
        lazyLoaded: number;
        eagerLoaded: number;
    };
    summary: {
        criticalPath: string[];
        slowestPhases: Array<{
            name: string;
            durationMs: number;
        }>;
        memoryDeltaMB: number;
    };
}
export declare class PerformanceInstrumentation {
    private startupTime;
    private memorySnapshots;
    private peakMemory;
    private phases;
    private completedPhases;
    private toolLoadMetrics;
    private lazyLoadedDomains;
    private eagerLoadedDomains;
    private alertConfig;
    private memoryAlerts;
    private static readonly MAX_MEMORY_SNAPSHOTS;
    private static readonly MAX_COMPLETED_PHASES;
    private static readonly MAX_TOOL_LOAD_METRICS;
    private static readonly MAX_MEMORY_ALERTS;
    private lastAlertLevel;
    constructor();
    /**
     * Take a memory snapshot with a label
     */
    snapshotMemory(label: string): MemorySnapshot;
    /**
     * Get current memory usage
     */
    getCurrentMemory(): MemorySnapshot;
    /**
     * Start timing a phase
     */
    startPhase(name: string, metadata?: Record<string, unknown>): void;
    /**
     * End timing a phase
     */
    endPhase(name: string, additionalMetadata?: Record<string, unknown>): number;
    /**
     * Wrap an async function with phase timing
     */
    timePhase<T>(name: string, fn: () => Promise<T>, metadata?: Record<string, unknown>): Promise<T>;
    /**
     * Record tool domain loading metrics
     */
    recordToolLoad(domain: string, toolCount: number, loadTimeMs: number, isLazy: boolean): void;
    /**
     * Get a comprehensive performance report
     */
    getReport(): PerformanceReport;
    /**
     * Get a concise summary for logging
     */
    getSummary(): {
        uptimeMin: number;
        heapUsedMB: number;
        peakHeapMB: number;
        toolsLoaded: number;
        domainsLoaded: number;
        lazyLoadedDomains: number;
    };
    /**
     * Log a performance summary
     */
    logSummary(): void;
    /**
     * Configure memory alert thresholds
     */
    configureAlerts(config: Partial<MemoryAlertConfig>): void;
    /**
     * Start automatic memory monitoring
     */
    startAutoMonitoring(): void;
    /**
     * Stop automatic memory monitoring
     */
    stopAutoMonitoring(): void;
    /**
     * Check memory against thresholds and create alerts if needed
     */
    checkMemoryThresholds(): MemoryAlert | null;
    /**
     * Create and log a memory alert
     */
    private createAlert;
    /**
     * Get all memory alerts
     */
    getAlerts(): MemoryAlert[];
    /**
     * Get active (unacknowledged) alerts
     */
    getActiveAlerts(): MemoryAlert[];
    /**
     * Acknowledge an alert
     */
    acknowledgeAlert(alertId: string): boolean;
    /**
     * Clear all alerts
     */
    clearAlerts(): void;
    /**
     * Get current alert configuration
     */
    getAlertConfig(): MemoryAlertConfig;
    /**
     * Reset all metrics (for testing)
     */
    reset(): void;
}
export declare const perfInstrumentation: PerformanceInstrumentation;
export default perfInstrumentation;
//# sourceMappingURL=performance-instrumentation.d.ts.map