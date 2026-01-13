/**
 * Presence Mode System
 *
 * > "Sometimes the best thing I can do is just be here."
 *
 * Detects when the user needs presence over solutions and shifts
 * Ferni into a "just be here" mode - fewer words, more silence,
 * holding space rather than fixing.
 *
 * Key indicators for presence mode:
 * - Heavy emotional content
 * - "I don't know what to do"
 * - Already received advice that didn't help
 * - Grief, loss, trauma mentions
 * - Late night + emotional content
 *
 * @module @ferni/superhuman/presence-mode
 */
export type PresenceLevel = 'normal' | 'gentle' | 'holding' | 'silent';
export interface PresenceDecision {
    /** Recommended presence level */
    level: PresenceLevel;
    /** Why this level was chosen */
    reason: string;
    /** Guidance for response style */
    guidance: string;
    /** Suggested SSML modifications */
    ssmlGuidance?: string;
    /** Suggested response openers */
    openers: string[];
}
export interface PresenceContext {
    /** User's message */
    message: string;
    /** Detected emotion */
    emotion: string;
    /** Emotion intensity (0-1) */
    emotionIntensity: number;
    /** Topics detected */
    topics: string[];
    /** Current hour (0-23) */
    hour: number;
    /** Turn count in session */
    turnCount: number;
    /** Recent AI responses (to detect failed advice) */
    recentResponses?: string[];
}
/**
 * Analyze context and determine appropriate presence level
 */
export declare function analyzePresenceNeed(context: PresenceContext): PresenceDecision;
/**
 * Format presence guidance for LLM prompt
 */
export declare function formatPresenceGuidance(context: PresenceContext): string | null;
/**
 * Check if we should avoid giving advice right now
 */
export declare function shouldAvoidAdvice(context: PresenceContext): boolean;
/**
 * Get simple presence acknowledgment
 */
export declare function getPresencePhrase(level: PresenceLevel): string;
//# sourceMappingURL=presence-mode.d.ts.map