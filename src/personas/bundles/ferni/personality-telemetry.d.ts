/**
 * Personality Telemetry & Transparency
 *
 * Real-time visibility into personality system decisions.
 * See exactly WHY Ferni chose a particular expression, what signals
 * influenced the decision, and how long each step took.
 *
 * "Better than human" means being able to explain ourselves.
 *
 * @module personas/bundles/ferni/personality-telemetry
 */
import type { ThemeCategory } from '../../../services/session-variety-tracker.js';
export interface TelemetrySnapshot {
    sessionId: string;
    turnCount: number;
    timestamp: Date;
    timing: {
        contextAssemblyMs: number;
        noticingDetectionMs: number;
        expressionLookupMs: number;
        totalMs: number;
    };
    decisions: {
        timeOfDay: string;
        momentum: string;
        emotionalState: string;
        relationshipStage: string;
        distressLevel: number;
        voiceEmotion?: string;
        voiceConfidence?: number;
        speechPace?: string;
        energyLevel?: string;
        noticingType?: string;
        noticingConfidence?: number;
        noticingShouldAcknowledge?: boolean;
        expressionTheme?: ThemeCategory;
        expressionSource?: 'llm' | 'composed' | 'pool' | 'memory' | 'cross-persona' | 'none';
        injectionPoint?: string;
        decisionReason: string;
    };
    output: {
        injected: boolean;
        content?: string;
        acknowledgment?: string;
    };
}
export interface PerformanceMetrics {
    avgContextAssemblyMs: number;
    avgNoticingDetectionMs: number;
    avgExpressionLookupMs: number;
    avgTotalMs: number;
    totalTurns: number;
    turnsWithInjection: number;
    turnsWithNoticing: number;
    llmExpressions: number;
    composedExpressions: number;
    poolExpressions: number;
    cacheHits: number;
    cacheMisses: number;
}
/**
 * Start timing a telemetry step
 */
export declare function startTiming(): {
    elapsed: () => number;
};
/**
 * Record a complete telemetry snapshot
 */
export declare function recordTelemetry(sessionId: string, snapshot: Omit<TelemetrySnapshot, 'timestamp'>): void;
/**
 * Get performance metrics for a session
 */
export declare function getSessionMetrics(sessionId: string): PerformanceMetrics | null;
/**
 * Get recent telemetry snapshots for a session
 */
export declare function getRecentSnapshots(sessionId: string): TelemetrySnapshot[];
/**
 * Get a summary of all active sessions
 */
export declare function getAllSessionsSummary(): Array<{
    sessionId: string;
    turnCount: number;
    avgMs: number;
    injectionRate: number;
}>;
/**
 * Format metrics as a human-readable string
 */
export declare function formatMetricsReport(sessionId: string): string;
/**
 * Clear metrics for a session
 */
export declare function clearSessionMetrics(sessionId: string): void;
export declare const personalityTelemetry: {
    startTiming: typeof startTiming;
    record: typeof recordTelemetry;
    getMetrics: typeof getSessionMetrics;
    getSnapshots: typeof getRecentSnapshots;
    getAllSummary: typeof getAllSessionsSummary;
    formatReport: typeof formatMetricsReport;
    clear: typeof clearSessionMetrics;
};
export default personalityTelemetry;
//# sourceMappingURL=personality-telemetry.d.ts.map