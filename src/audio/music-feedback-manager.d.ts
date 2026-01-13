/**
 * Music Feedback Manager
 *
 * Singleton manager for recording music transition feedback.
 * This allows the feedback recording function to be set by the music handler
 * and called from anywhere (e.g., transcript handler).
 *
 * Why a singleton? Because the music handler creates the feedback function
 * in a closure, but the transcript handler (in a different file) needs to
 * call it when the user speaks after music ends.
 */
export interface MusicFeedback {
    /** What the user said after the music transition */
    userResponse?: string;
    /** Whether the response seemed positive (detected or explicit) */
    wasPositive?: boolean;
    /** Voice tone analysis */
    voiceTone?: 'warmer' | 'calmer' | 'energized' | 'neutral';
    /** Whether user continued the session */
    continuedSession?: boolean;
    /** Time in ms since music ended */
    timeSinceTransitionMs?: number;
}
export type MusicFeedbackRecorder = (feedback: MusicFeedback) => void;
/**
 * Register the feedback recorder for the current session
 * Called by setupMusicHandler when music handler is initialized
 */
export declare function registerMusicFeedbackRecorder(sessionId: string, recorder: MusicFeedbackRecorder): void;
/**
 * Mark that music has ended (call when transition happens)
 * This starts the window for feedback recording
 */
export declare function markMusicEnded(): void;
/**
 * Record feedback for the last music transition
 * Call this when user speaks to update per-user learning
 *
 * @param feedback - The feedback signals
 * @param sessionId - Session ID to verify correct session
 * @returns Whether feedback was recorded
 */
export declare function recordMusicFeedback(feedback: MusicFeedback, sessionId?: string): boolean;
/**
 * Check if there's a recent music transition to provide feedback on
 */
export declare function hasPendingMusicFeedback(): boolean;
/**
 * Clear the feedback recorder (call on session end)
 */
export declare function clearMusicFeedbackRecorder(sessionId?: string): void;
/**
 * Auto-detect feedback signals from user response
 *
 * Enhanced with semantic understanding:
 * - Multiple pattern categories with weighted scoring
 * - Confidence based on signal strength
 * - Better handling of nuanced responses
 *
 * @param userResponse - What the user said
 * @returns Detected feedback signals with confidence
 */
export declare function detectFeedbackFromResponse(userResponse: string): Partial<MusicFeedback> & {
    confidence?: number;
    matchedCategories?: string[];
};
/**
 * Simple feedback detection (backward compatible)
 * Returns basic wasPositive without confidence scoring
 */
export declare function detectFeedbackSimple(userResponse: string): Partial<MusicFeedback>;
declare const _default: {
    registerMusicFeedbackRecorder: typeof registerMusicFeedbackRecorder;
    markMusicEnded: typeof markMusicEnded;
    recordMusicFeedback: typeof recordMusicFeedback;
    hasPendingMusicFeedback: typeof hasPendingMusicFeedback;
    clearMusicFeedbackRecorder: typeof clearMusicFeedbackRecorder;
    detectFeedbackFromResponse: typeof detectFeedbackFromResponse;
};
export default _default;
//# sourceMappingURL=music-feedback-manager.d.ts.map