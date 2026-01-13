/**
 * Error & Recovery Metrics
 *
 * Tracks error rates and recovery patterns:
 * - Error frequency by type
 * - Retry success rates
 * - Fallback activations
 * - Recovery time
 * - Error clusters
 */
export type ErrorCategory = 'network' | 'api' | 'llm' | 'tts' | 'stt' | 'memory' | 'handoff' | 'auth' | 'unknown';
export interface ErrorEvent {
    id: string;
    timestamp: number;
    category: ErrorCategory;
    code?: string;
    message: string;
    stack?: string;
    userId?: string;
    sessionId?: string;
    recovered: boolean;
    recoveryMethod?: 'retry' | 'fallback' | 'graceful_degradation' | 'user_intervention';
    recoveryTimeMs?: number;
    retryCount?: number;
}
export interface ErrorSnapshot {
    totalErrors: number;
    errorsLastHour: number;
    errorsLast5Min: number;
    errorsByCategory: Record<ErrorCategory, number>;
    errorRateByCategory: Record<ErrorCategory, number>;
    recoveryRate: number;
    avgRecoveryTimeMs: number;
    retrySuccessRate: number;
    fallbackActivations: number;
    mostCommonErrors: Array<{
        message: string;
        count: number;
    }>;
    errorClusters: Array<{
        timeWindow: string;
        count: number;
    }>;
    errorHealthScore: number;
}
export declare function recordError(error: Error | string, category: ErrorCategory, context?: {
    userId?: string;
    sessionId?: string;
    code?: string;
}): string;
export declare function recordRecovery(errorId: string, method: ErrorEvent['recoveryMethod'], recoveryTimeMs: number, retryCount?: number): void;
export declare function recordRetry(category: ErrorCategory, success: boolean, attemptNumber: number, latencyMs: number, context?: {
    userId?: string;
    sessionId?: string;
}): void;
export declare function recordFallback(fromService: string, toService: string, reason: string, context?: {
    userId?: string;
    sessionId?: string;
}): void;
export declare function getSnapshot(): ErrorSnapshot;
export declare const errorMetrics: {
    recordError: typeof recordError;
    recordRecovery: typeof recordRecovery;
    recordRetry: typeof recordRetry;
    recordFallback: typeof recordFallback;
    getSnapshot: typeof getSnapshot;
};
//# sourceMappingURL=error-recovery.d.ts.map