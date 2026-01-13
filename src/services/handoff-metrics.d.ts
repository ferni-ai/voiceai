/**
 * Handoff Metrics Service
 *
 * Tracks all handoff attempts, successes, failures, and timing.
 * Provides analytics for diagnosing handoff issues.
 *
 * Usage:
 *   import { handoffMetrics } from './handoff-metrics.js';
 *
 *   // Record a handoff attempt
 *   const traceId = handoffMetrics.startHandoff('ferni', 'peter-john', 'ui_click');
 *
 *   // Record success/failure
 *   handoffMetrics.completeHandoff(traceId, true);
 *   // or
 *   handoffMetrics.failHandoff(traceId, 'tool_not_found', 'handoffToPeter not in registry');
 */
export type HandoffSource = 'ui_click' | 'voice_request' | 'tool_call' | 'auto_routing' | 'return_to_coach';
export type HandoffFailureReason = 'tool_not_found' | 'persona_not_found' | 'no_listeners' | 'rate_limited' | 'already_with_agent' | 'connection_lost' | 'voice_switch_failed' | 'timeout' | 'validation_failed' | 'team_locked' | 'unknown';
export type HandoffPhase = 'initiated' | 'validated' | 'event_emitted' | 'handler_started' | 'voice_switched' | 'frontend_notified' | 'completed' | 'failed';
export interface HandoffTrace {
    id: string;
    sessionId: string;
    fromAgent: string;
    toAgent: string;
    source: HandoffSource;
    startTime: number;
    endTime?: number;
    durationMs?: number;
    currentPhase: HandoffPhase;
    phaseTimings: Record<HandoffPhase, number>;
    success?: boolean;
    failureReason?: HandoffFailureReason;
    errorMessage?: string;
    errorStack?: string;
    listenerCount?: number;
    toolName?: string;
    availableTools?: string[];
}
export interface HandoffMetricsSummary {
    totalAttempts: number;
    totalSuccesses: number;
    totalFailures: number;
    successRate: number;
    byFromAgent: Record<string, {
        attempts: number;
        successes: number;
        failures: number;
    }>;
    byToAgent: Record<string, {
        attempts: number;
        successes: number;
        failures: number;
    }>;
    byFailureReason: Record<HandoffFailureReason, number>;
    avgDurationMs: number;
    p50DurationMs: number;
    p95DurationMs: number;
    maxDurationMs: number;
    recentFailures: HandoffTrace[];
    windowStartTime: number;
    windowEndTime: number;
}
declare class HandoffMetricsService {
    private traces;
    private completedTraces;
    private readonly MAX_COMPLETED_TRACES;
    private readonly MAX_RECENT_FAILURES;
    private logger;
    /**
     * Start tracking a new handoff attempt.
     * Returns a trace ID for subsequent updates.
     */
    startHandoff(fromAgent: string, toAgent: string, source: HandoffSource, sessionId?: string): string;
    /**
     * Update the current phase of a handoff.
     */
    updatePhase(traceId: string, phase: HandoffPhase, context?: Record<string, unknown>): void;
    /**
     * Mark a handoff as successfully completed.
     */
    completeHandoff(traceId: string): void;
    /**
     * Mark a handoff as failed.
     */
    failHandoff(traceId: string, reason: HandoffFailureReason, errorMessage?: string, errorStack?: string): void;
    /**
     * Get the current summary of handoff metrics.
     */
    getSummary(windowMinutes?: number): HandoffMetricsSummary;
    /**
     * Get all in-progress handoffs.
     */
    getInProgressHandoffs(): HandoffTrace[];
    /**
     * Get a specific trace by ID.
     */
    getTrace(traceId: string): HandoffTrace | undefined;
    /**
     * Clear all metrics (for testing).
     */
    clear(): void;
    private archiveTrace;
    /**
     * Send handoff event to Admin Diagnostics API
     * This bridges the detailed metrics service with the admin dashboard
     */
    private sendToAdminDashboard;
    private getPhaseBreakdown;
    private getLastSuccessfulPhase;
}
export declare const handoffMetrics: HandoffMetricsService;
/**
 * Start tracking a handoff from the executor.
 * Convenience wrapper with common defaults.
 */
export declare function trackHandoffStart(fromAgent: string, toAgent: string, source?: HandoffSource, sessionId?: string): string;
/**
 * Record a phase update.
 */
export declare function trackHandoffPhase(traceId: string, phase: HandoffPhase, context?: Record<string, unknown>): void;
/**
 * Record handoff success.
 */
export declare function trackHandoffSuccess(traceId: string): void;
/**
 * Record handoff failure.
 */
export declare function trackHandoffFailure(traceId: string, reason: HandoffFailureReason, errorMessage?: string, errorStack?: string): void;
/**
 * Handoff metrics data for simplified recording.
 */
export interface HandoffMetricsData {
    traceId: string;
    from: string;
    to: string;
    success: boolean;
    durationMs: number;
    source: string;
    error?: string;
}
/**
 * Record handoff metrics with a single call.
 * This is the simplified API used by HandoffCoordinator.
 */
export declare function recordHandoffMetrics(data: HandoffMetricsData): void;
export {};
//# sourceMappingURL=handoff-metrics.d.ts.map