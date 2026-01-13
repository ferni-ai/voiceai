/**
 * TTS Bulkhead - Session Isolation for Voice Synthesis
 *
 * SET-17: Prevents one session's slow TTS synthesis from blocking other sessions.
 * Implements the bulkhead pattern with per-session and global limits.
 *
 * Key features:
 * 1. Per-session concurrency limits (prevent session monopolization)
 * 2. Global concurrency limits (prevent system overload)
 * 3. Request timeouts (fail fast on slow operations)
 * 4. Queue management with priority support
 * 5. Metrics for observability
 *
 * Philosophy: Voice synthesis should never block user experience.
 * If TTS is slow, fail fast and let the conversation continue.
 *
 * @module speech/tts-bulkhead
 */
import type { ResilienceMetricsService } from '../services/observability/resilience-metrics.js';
export interface TTSBulkheadConfig {
    /** Maximum concurrent TTS operations globally (default: 20) */
    maxGlobalConcurrent: number;
    /** Maximum concurrent TTS operations per session (default: 3) */
    maxPerSession: number;
    /** Request timeout in milliseconds (default: 10000) */
    timeoutMs: number;
    /** Maximum queue size per session (default: 5) */
    maxQueuePerSession: number;
    /** Whether to enable metrics reporting */
    enableMetrics: boolean;
}
export interface TTSRequest<T> {
    /** Session ID for isolation */
    sessionId: string;
    /** Priority (higher = processed first) */
    priority: 'high' | 'normal' | 'low';
    /** The TTS operation to execute */
    operation: () => Promise<T>;
    /** Operation name for metrics/logging */
    name?: string;
}
export interface TTSBulkheadResult<T> {
    /** Whether the operation succeeded */
    success: boolean;
    /** The result (if success) */
    result?: T;
    /** Error message (if failed) */
    error?: string;
    /** Time spent queued in ms */
    queueTimeMs: number;
    /** Time spent executing in ms */
    executionTimeMs: number;
    /** Whether request was rejected due to limits */
    rejected: boolean;
    /** Rejection reason if rejected */
    rejectionReason?: 'global_limit' | 'session_limit' | 'queue_full' | 'timeout';
}
interface QueuedRequest<T> {
    request: TTSRequest<T>;
    enqueuedAt: number;
    resolve: (result: TTSBulkheadResult<T>) => void;
}
interface SessionState {
    /** Current concurrent operations */
    concurrent: number;
    /** Queued requests */
    queue: Array<QueuedRequest<unknown>>;
    /** Total requests processed */
    totalRequests: number;
    /** Successful requests */
    successfulRequests: number;
    /** Failed requests */
    failedRequests: number;
    /** Rejected requests */
    rejectedRequests: number;
    /** Last activity timestamp */
    lastActivity: number;
}
export interface TTSBulkheadStats {
    /** Current global concurrent operations */
    globalConcurrent: number;
    /** Maximum global concurrent allowed */
    maxGlobalConcurrent: number;
    /** Number of active sessions */
    activeSessions: number;
    /** Total queued requests across all sessions */
    totalQueued: number;
    /** Total requests processed */
    totalRequests: number;
    /** Total successful requests */
    successfulRequests: number;
    /** Total rejected requests */
    rejectedRequests: number;
    /** Average execution time in ms */
    avgExecutionTimeMs: number;
    /** Average queue time in ms */
    avgQueueTimeMs: number;
    /** Is under pressure (near limits) */
    isUnderPressure: boolean;
}
export declare class TTSBulkhead {
    private config;
    private sessions;
    private globalConcurrent;
    private executionTimes;
    private queueTimes;
    private metricsService;
    private stats;
    constructor(config?: Partial<TTSBulkheadConfig>);
    /**
     * Set metrics service for reporting
     */
    setMetricsService(service: ResilienceMetricsService): void;
    /**
     * Execute a TTS operation with bulkhead isolation
     */
    execute<T>(request: TTSRequest<T>): Promise<TTSBulkheadResult<T>>;
    /**
     * Check if we can accept more requests (for pre-flight checks)
     */
    canAcceptRequest(sessionId: string): boolean;
    /**
     * Check if system is under pressure
     */
    isUnderPressure(): boolean;
    /**
     * Get bulkhead statistics
     */
    getStats(): TTSBulkheadStats;
    /**
     * Get session-specific stats
     */
    getSessionStats(sessionId: string): Omit<SessionState, 'queue'> | null;
    /**
     * Clean up a session's state
     */
    cleanupSession(sessionId: string): void;
    private getOrCreateSession;
    private reject;
    private enqueue;
    private executeOperation;
    private executeWithTimeout;
    private processQueue;
    private getPriorityValue;
    private cleanupStaleSessions;
}
export declare class TimeoutError extends Error {
    constructor(message: string);
}
/**
 * Get the TTS bulkhead singleton instance
 */
export declare function getTTSBulkhead(config?: Partial<TTSBulkheadConfig>): TTSBulkhead;
/**
 * Reset the TTS bulkhead (for testing)
 */
export declare function resetTTSBulkhead(): void;
/**
 * Execute TTS with bulkhead protection
 */
export declare function executeWithBulkhead<T>(sessionId: string, operation: () => Promise<T>, options?: {
    priority?: 'high' | 'normal' | 'low';
    name?: string;
}): Promise<TTSBulkheadResult<T>>;
/**
 * Check if TTS bulkhead can accept more requests
 */
export declare function canAcceptTTSRequest(sessionId: string): boolean;
/**
 * Check if TTS system is under pressure
 */
export declare function isTTSUnderPressure(): boolean;
/**
 * Get TTS bulkhead statistics
 */
export declare function getTTSBulkheadStats(): TTSBulkheadStats;
/**
 * Clean up TTS session state
 */
export declare function cleanupTTSSession(sessionId: string): void;
export default TTSBulkhead;
//# sourceMappingURL=tts-bulkhead.d.ts.map