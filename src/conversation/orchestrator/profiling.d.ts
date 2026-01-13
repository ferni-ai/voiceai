/**
 * Conversation Humanization Performance Profiling
 *
 * Provides detailed performance profiling for the humanization pipeline.
 * Use this to identify bottlenecks and optimize critical paths.
 *
 * Usage:
 * ```typescript
 * import { ConversationProfiler, getProfiler } from './profiling.js';
 *
 * const profiler = getProfiler('session-123');
 * profiler.startProfiling();
 *
 * // ... run humanization ...
 *
 * const report = profiler.endProfiling();
 * console.log(report.summary);
 * ```
 *
 * @module @ferni/conversation/orchestrator/profiling
 */
export interface ProfilerConfig {
    /** Enable detailed phase timing */
    enablePhaseTimings: boolean;
    /** Enable feature-level timing */
    enableFeatureTimings: boolean;
    /** Enable memory tracking */
    enableMemoryTracking: boolean;
    /** Threshold (ms) for slow phase warnings */
    slowPhaseThresholdMs: number;
    /** Threshold (ms) for slow total warnings */
    slowTotalThresholdMs: number;
}
export interface PhaseTiming {
    name: string;
    startTime: number;
    endTime: number;
    duration: number;
    features?: FeatureTiming[];
}
export interface FeatureTiming {
    name: string;
    duration: number;
    applied: boolean;
    skipped?: string;
}
export interface ProfilerSnapshot {
    timestamp: number;
    turnNumber: number;
    phases: PhaseTiming[];
    totalDuration: number;
    memoryUsage?: NodeJS.MemoryUsage;
    appliedFeatures: string[];
    skippedFeatures: string[];
}
export interface ProfilerReport {
    sessionId: string;
    snapshots: ProfilerSnapshot[];
    summary: ProfilerSummary;
    recommendations: string[];
}
export interface ProfilerSummary {
    totalTurns: number;
    avgTotalDuration: number;
    maxTotalDuration: number;
    minTotalDuration: number;
    p50Duration: number;
    p95Duration: number;
    p99Duration: number;
    phaseBreakdown: Record<string, {
        avgDuration: number;
        maxDuration: number;
        percentOfTotal: number;
    }>;
    slowTurns: number;
    featureStats: Record<string, {
        appliedCount: number;
        avgDuration: number;
    }>;
}
export declare const DEFAULT_PROFILER_CONFIG: ProfilerConfig;
export declare class ConversationProfiler {
    private sessionId;
    private config;
    private snapshots;
    private currentTurn;
    private isProfiling;
    private currentPhases;
    private currentPhase;
    private currentFeatures;
    private turnStartTime;
    constructor(sessionId: string, config?: Partial<ProfilerConfig>);
    /**
     * Start profiling a new session
     */
    startProfiling(): void;
    /**
     * End profiling and generate report
     */
    endProfiling(): ProfilerReport;
    /**
     * Check if profiling is active
     */
    isActive(): boolean;
    /**
     * Start tracking a new turn
     */
    startTurn(): void;
    /**
     * End tracking the current turn
     */
    endTurn(appliedFeatures: string[], skippedFeatures: string[]): void;
    /**
     * Start tracking a phase
     */
    startPhase(name: string): void;
    /**
     * End tracking the current phase
     */
    endPhase(): void;
    /**
     * Record a feature timing
     */
    recordFeature(name: string, duration: number, applied: boolean, skipped?: string): void;
    /**
     * Time a feature execution
     */
    timeFeature<T>(name: string, fn: () => Promise<T>): Promise<{
        result: T;
        duration: number;
    }>;
    /**
     * Time a synchronous feature execution
     */
    timeFeatureSync<T>(name: string, fn: () => T): {
        result: T;
        duration: number;
    };
    /**
     * Generate a profiling report
     */
    generateReport(): ProfilerReport;
    private calculateSummary;
    private generateRecommendations;
    /**
     * Log the current profiling summary
     */
    logSummary(): void;
}
/**
 * Get or create a profiler for a session
 */
export declare function getProfiler(sessionId: string, config?: Partial<ProfilerConfig>): ConversationProfiler;
/**
 * Clear a profiler
 */
export declare function clearProfiler(sessionId: string): void;
/**
 * Clear all profilers
 */
export declare function clearAllProfilers(): void;
/**
 * Profile a function call
 */
export declare function profileCall<T>(sessionId: string, phaseName: string, fn: () => Promise<T>): Promise<{
    result: T;
    duration: number;
}>;
/**
 * Profile multiple phases
 */
export declare function createPhaseProfiler(sessionId: string): {
    phase: (name: string) => void;
    endPhase: () => void;
    feature: <T>(name: string, fn: () => T) => T;
    asyncFeature: <T>(name: string, fn: () => Promise<T>) => Promise<T>;
};
export interface OrchestratorTiming {
    analysis: number;
    intelligence: number;
    humanization: number;
    output: number;
    total: number;
}
/**
 * Record orchestration timing from the ConversationOrchestrator
 * Simple helper that integrates with the existing profiler
 */
export declare function profileOrchestration(sessionId: string, turnNumber: number, timing: OrchestratorTiming): void;
//# sourceMappingURL=profiling.d.ts.map