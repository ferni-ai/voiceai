/**
 * Persistence Metrics & Monitoring
 *
 * Tracks key metrics for the intelligence persistence system to enable
 * observability into how well user learning is working.
 *
 * Metrics tracked:
 * - Profile save/load operations
 * - Intelligence state export/import
 * - Auto-save frequency and success
 * - Session lifecycle events
 * - Data integrity checks
 *
 * @module services/persistence-metrics
 */
interface MetricValue {
    count: number;
    lastOccurred: Date | null;
    lastDurationMs: number | null;
    totalDurationMs: number;
    errors: number;
    lastError: string | null;
}
interface SessionMetrics {
    sessionId: string;
    userId: string;
    personaId: string;
    startTime: Date;
    endTime: Date | null;
    autoSaveCount: number;
    intelligenceExports: number;
    intelligenceImports: number;
    handoffCount: number;
}
export interface PersistenceMetricsSnapshot {
    timestamp: Date;
    uptime: number;
    profileLoads: MetricValue;
    profileSaves: MetricValue;
    profileUpdates: MetricValue;
    intelligenceExports: MetricValue;
    intelligenceImports: MetricValue;
    sessionsStarted: MetricValue;
    sessionsEnded: MetricValue;
    autoSaves: MetricValue;
    handoffs: MetricValue;
    validationErrors: MetricValue;
    dataRecoveries: MetricValue;
    activeSessions: number;
    currentSessions: SessionMetrics[];
}
declare class PersistenceMetricsTracker {
    private startTime;
    private logger;
    private profileLoads;
    private profileSaves;
    private profileUpdates;
    private intelligenceExports;
    private intelligenceImports;
    private sessionsStarted;
    private sessionsEnded;
    private autoSaves;
    private handoffs;
    private validationErrors;
    private dataRecoveries;
    private activeSessions;
    constructor();
    private createMetricValue;
    private recordMetric;
    recordProfileLoad(userId: string, durationMs: number, error?: string): void;
    recordProfileSave(userId: string, durationMs: number, error?: string): void;
    recordProfileUpdate(userId: string, field: string, durationMs: number, error?: string): void;
    recordIntelligenceExport(userId: string, engineCount: number, durationMs: number, error?: string): void;
    recordIntelligenceImport(userId: string, engineCount: number, durationMs: number, error?: string): void;
    recordSessionStart(sessionId: string, userId: string, personaId: string): void;
    recordSessionEnd(sessionId: string, durationMs?: number, error?: string): void;
    recordAutoSave(sessionId: string, durationMs: number, error?: string): void;
    recordHandoff(sessionId: string, fromAgent: string, toAgent: string, durationMs: number, error?: string): void;
    recordValidationError(userId: string, field: string, error: string): void;
    recordDataRecovery(userId: string, recoveredFields: string[], durationMs: number): void;
    private findSessionByUser;
    getSnapshot(): PersistenceMetricsSnapshot;
    /**
     * Get a summary report suitable for logging
     */
    getSummaryReport(): Record<string, unknown>;
    /**
     * Log current metrics summary
     */
    logSummary(): void;
    /**
     * Reset all metrics (useful for testing)
     */
    reset(): void;
}
export declare const persistenceMetrics: PersistenceMetricsTracker;
/**
 * Helper to time an operation and record its metrics
 */
export declare function withMetrics<T>(operation: string, fn: () => Promise<T>, onComplete: (durationMs: number, error?: string) => void): Promise<T>;
/**
 * Helper for synchronous operations
 */
export declare function withMetricsSync<T>(operation: string, fn: () => T, onComplete: (durationMs: number, error?: string) => void): T;
export {};
//# sourceMappingURL=persistence-metrics.d.ts.map