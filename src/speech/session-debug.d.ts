/**
 * Speech Session Debug Utility
 *
 * Provides debugging and monitoring capabilities for speech sessions.
 * Use this for:
 * - Inspecting active session state
 * - Diagnosing issues in production
 * - Performance monitoring
 * - Memory leak detection
 *
 * @module session-debug
 */
import { getSpeechMetricsSnapshot } from './metrics/index.js';
/**
 * Debug information for a speech session
 */
export interface SpeechSessionDebugInfo {
    /** Session ID */
    sessionId: string;
    /** Session start time */
    startTime: Date;
    /** List of active services for this session */
    activeServices: string[];
    /** Collected metrics */
    metrics: {
        /** Number of backchannels sent */
        backchannelCount: number;
        /** Number of turn predictions made */
        turnPredictions: number;
        /** Detected emotions */
        emotionsDetected: string[];
        /** Prosody analysis count */
        prosodyAnalyses: number;
        /** Cache hit rate for response anticipation */
        anticipationHitRate: number;
    };
    /** Memory estimate (approximate) */
    estimatedMemoryKB: number;
}
/**
 * Aggregate debug information across all sessions
 */
export interface SpeechModuleDebugInfo {
    /** Total active sessions */
    totalSessions: number;
    /** Active service counts */
    serviceCounts: {
        audioProsody: number;
        backchanneling: number;
        fftAnalyzer: number;
        responseAnticipation: number;
        voiceManager: number;
    };
    /** Metrics snapshot */
    metrics: ReturnType<typeof getSpeechMetricsSnapshot>;
    /** List of session IDs */
    sessionIds: string[];
    /** Uptime in seconds */
    uptimeSeconds: number;
    /** Estimated total memory usage */
    estimatedTotalMemoryKB: number;
}
/**
 * Register metrics tracking for a new session
 */
export declare function trackSessionStart(sessionId: string): void;
/**
 * Increment backchannel count for a session
 */
export declare function trackBackchannel(sessionId: string): void;
/**
 * Increment turn prediction count for a session
 */
export declare function trackTurnPrediction(sessionId: string): void;
/**
 * Track detected emotion for a session
 */
export declare function trackEmotionDetected(sessionId: string, emotion: string): void;
/**
 * Increment prosody analysis count for a session
 */
export declare function trackProsodyAnalysis(sessionId: string): void;
/**
 * Clean up tracking for a session
 */
export declare function cleanupSessionTracking(sessionId: string): void;
/**
 * Get debug information for a specific session
 */
export declare function getSessionDebugInfo(sessionId: string): SpeechSessionDebugInfo | null;
/**
 * Get debug information for all sessions
 */
export declare function getAllSessionsDebugInfo(): SpeechSessionDebugInfo[];
/**
 * Get aggregate debug information for the entire speech module
 */
export declare function getSpeechModuleDebugInfo(): SpeechModuleDebugInfo;
/**
 * Check for potential memory leaks
 *
 * Returns issues if service counts don't match session counts
 */
export declare function checkForLeaks(): {
    hasIssues: boolean;
    issues: string[];
};
/**
 * Log current module state (for debugging)
 */
export declare function logModuleState(): void;
declare const _default: {
    trackSessionStart: typeof trackSessionStart;
    trackBackchannel: typeof trackBackchannel;
    trackTurnPrediction: typeof trackTurnPrediction;
    trackEmotionDetected: typeof trackEmotionDetected;
    trackProsodyAnalysis: typeof trackProsodyAnalysis;
    cleanupSessionTracking: typeof cleanupSessionTracking;
    getSessionDebugInfo: typeof getSessionDebugInfo;
    getAllSessionsDebugInfo: typeof getAllSessionsDebugInfo;
    getSpeechModuleDebugInfo: typeof getSpeechModuleDebugInfo;
    checkForLeaks: typeof checkForLeaks;
    logModuleState: typeof logModuleState;
};
export default _default;
//# sourceMappingURL=session-debug.d.ts.map