/**
 * Session Manager Utilities
 *
 * Reusable utility functions for session management.
 *
 * @module session-manager/utils
 */
/**
 * Execute a promise with a timeout
 * Returns null if the operation times out
 */
export declare function withTimeout<T>(promise: Promise<T>, timeoutMs: number, operationName: string, sessionId?: string): Promise<T | null>;
/**
 * Generate a fallback conversation summary when LLM summarization fails
 */
export declare function generateFallbackSummary(turns: Array<{
    role: string;
    content: string;
}>, topicsDiscussed: string[], durationMinutes: number): string;
/**
 * Calculate speaking pace category from WPM
 */
export declare function calculateSpeakingPace(wpm: number): 'slow' | 'moderate' | 'fast';
/**
 * Calculate blended WPM from session and profile data
 */
export declare function blendWPM(sessionWPM: number, profileWPM?: number): number;
/**
 * Map speaking pace to WPM estimate
 */
export declare function paceToWPM(pace: 'slow' | 'moderate' | 'fast'): number;
//# sourceMappingURL=utils.d.ts.map