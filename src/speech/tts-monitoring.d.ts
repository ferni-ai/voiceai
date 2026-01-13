/**
 * TTS Monitoring Module
 *
 * Monitors text-to-speech output for potential issues:
 * - Stage directions that slipped through sanitization
 * - Suspicious patterns that might be spoken literally
 * - Tracks sanitization effectiveness over time
 *
 * @module TTSMonitoring
 */
export interface TTSMonitorResult {
    /** Whether any issues were found */
    hasIssues: boolean;
    /** List of suspicious patterns found */
    issues: string[];
    /** The text that was checked */
    originalText: string;
    /** Suggested fix (if any) */
    suggestedFix?: string;
}
/**
 * Check text for suspicious patterns before TTS.
 * Call this after sanitization to catch anything that slipped through.
 *
 * @param text - The text about to be sent to TTS
 * @param context - Optional context for logging (sessionId, turnNumber, etc.)
 * @returns Monitor result with any issues found
 */
export declare function checkTTSText(text: string, context?: {
    sessionId?: string;
    turnNumber?: number;
    personaId?: string;
}): TTSMonitorResult;
/**
 * Track sanitization check for analytics
 */
export declare function trackTTSCheck(result: TTSMonitorResult): void;
/**
 * Get current sanitization statistics
 */
export declare function getTTSStats(): {
    totalChecks: number;
    issuesFound: number;
    issueRate: number;
    topPatterns: Array<{
        pattern: string;
        count: number;
    }>;
    lastIssue?: {
        time: Date;
        textPreview: string;
    };
};
/**
 * Reset statistics (for testing)
 */
export declare function resetTTSStats(): void;
/**
 * Monitor and optionally fix TTS text.
 * Use this as a final safety check before sending text to Cartesia.
 *
 * @param text - Text to check
 * @param options - Monitoring options
 * @returns The text (possibly fixed) and monitoring result
 */
export declare function monitorTTSText(text: string, options?: {
    sessionId?: string;
    turnNumber?: number;
    personaId?: string;
    autoFix?: boolean;
    trackStats?: boolean;
}): {
    text: string;
    result: TTSMonitorResult;
};
declare const _default: {
    checkTTSText: typeof checkTTSText;
    monitorTTSText: typeof monitorTTSText;
    getTTSStats: typeof getTTSStats;
    resetTTSStats: typeof resetTTSStats;
    trackTTSCheck: typeof trackTTSCheck;
};
export default _default;
//# sourceMappingURL=tts-monitoring.d.ts.map