/**
 * Silence Handling
 *
 * Evaluates and handles comfortable silence in conversations.
 *
 * @module conversation/active-listening/silence-handling
 */
import type { SilenceEvaluation } from './types.js';
/**
 * Evaluate if silence is comfortable in the given context
 */
export declare function evaluateSilence(silenceDurationMs: number, context: {
    userJustSharedPersonal?: boolean;
    userIsThinking?: boolean;
    emotionalIntensity?: 'high' | 'medium' | 'low';
}): SilenceEvaluation;
/**
 * Get a gentle prompt for re-engaging after silence
 */
export declare function getGentlePrompt(context?: {
    lastTopic?: string;
    userEmotion?: string;
}): string;
//# sourceMappingURL=silence-handling.d.ts.map