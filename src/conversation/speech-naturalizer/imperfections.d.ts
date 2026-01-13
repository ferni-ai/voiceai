/**
 * Speech Imperfections
 *
 * Enhanced imperfection patterns that create authentic human-like speech.
 *
 * @module @ferni/conversation/speech-naturalizer/imperfections
 */
import { type RandomSource } from '../utils/rng.js';
/**
 * Generate natural sentence fragments
 */
export declare function generateFragment(context: 'trailing' | 'interrupted' | 'rethinking'): string;
/**
 * Mid-thought course correction patterns
 */
export declare const MID_THOUGHT_CORRECTIONS: string[];
/**
 * Generate a mid-thought course correction
 */
export declare function generateCourseCorrection(originalThought: string, correctedThought: string): string;
/**
 * Self-doubt to conviction transitions
 */
export declare const DOUBT_TO_CONVICTION: Array<{
    doubt: string;
    conviction: string;
}>;
/**
 * Generate a doubt-to-conviction transition
 */
export declare function generateDoubtToConviction(statement: string): string;
/**
 * Thinking out loud patterns
 */
export declare const THINKING_OUT_LOUD: string[];
/**
 * Generate a thinking-out-loud prefix
 */
export declare function generateThinkingOutLoud(): string;
/**
 * Graceful uncertainty expressions
 */
export declare const GRACEFUL_UNCERTAINTY: string[];
/**
 * Generate a graceful uncertainty prefix
 */
export declare function generateGracefulUncertainty(statement: string): string;
/**
 * Self-interruption patterns
 */
export declare const SELF_INTERRUPTIONS: Array<{
    start: string;
    interrupt: string;
    resume: string;
}>;
/**
 * Generate a self-interruption
 */
export declare function generateSelfInterruption(statement: string): string;
/**
 * Determine if imperfection should be applied
 */
export declare function shouldApplyImperfection(context: {
    isSeriousContext?: boolean;
    emotion?: string;
    turnNumber?: number;
    rng?: RandomSource;
    randomSeed?: string;
}): boolean;
/**
 * Apply random imperfection to response
 */
export declare function applyRandomImperfection(text: string, context: {
    isSeriousContext?: boolean;
    emotion?: string;
    turnNumber?: number;
    rng?: RandomSource;
    randomSeed?: string;
}): string;
//# sourceMappingURL=imperfections.d.ts.map