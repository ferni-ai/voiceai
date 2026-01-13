/**
 * Distress Level Constants & Utilities
 *
 * Centralized distress level thresholds to ensure consistent
 * emotional response handling across all context builders.
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * When someone is struggling, our response should be consistent and calibrated.
 * These thresholds define how we categorize and respond to emotional distress.
 *
 * @module intelligence/distress-levels
 */
/**
 * Distress level thresholds (0-1 scale)
 *
 * These are calibrated based on:
 * - Clinical psychology guidelines for crisis intervention
 * - User feedback and engagement data
 * - The principle of "empathy first, advice second"
 */
export declare const DISTRESS: {
    /**
     * CRISIS (0.8+): Immediate intervention required
     * - User may be in panic, crisis, or acute distress
     * - All other concerns are secondary
     * - Focus: Presence, grounding, safety
     */
    readonly CRISIS: 0.8;
    /**
     * HIGH (0.7+): Switch to full support mode
     * - User is clearly struggling
     * - Advice/information should wait
     * - Focus: Validation, empathy, slowing down
     */
    readonly HIGH: 0.7;
    /**
     * MODERATE (0.5+): Acknowledge feelings first
     * - User is experiencing significant emotions
     * - Lead with empathy before any practical discussion
     * - Focus: Validation, then gentle exploration
     */
    readonly MODERATE: 0.5;
    /**
     * ELEVATED (0.4+): Be mindful of emotions
     * - User has some emotional weight
     * - Don't ignore it, but don't over-focus
     * - Focus: Acknowledge and proceed thoughtfully
     */
    readonly ELEVATED: 0.4;
    /**
     * MILD (0.2+): Light emotional awareness
     * - User has minor emotional signals
     * - Normal conversation with emotional awareness
     * - Focus: Natural, warm interaction
     */
    readonly MILD: 0.2;
    /**
     * LOW (< 0.2): Normal conversation
     * - No significant distress detected
     * - Focus: Engage naturally
     */
    readonly LOW: 0;
};
export type DistressLevel = keyof typeof DISTRESS;
/**
 * Response guidance for each distress level
 */
export declare const DISTRESS_GUIDANCE: Record<DistressLevel, DistressGuidance>;
export interface DistressGuidance {
    level: DistressLevel;
    threshold: number;
    tone: 'gentle' | 'warm' | 'friendly' | 'calm';
    responseLength: 'very_short' | 'short' | 'moderate' | 'normal';
    priority: string;
    guidance: string[];
    doNot: string[];
}
/**
 * Get the distress category for a given level (0-1)
 *
 * @param level - Distress level from 0 to 1
 * @returns The distress category
 *
 * @example
 * getDistressCategory(0.85) // => 'CRISIS'
 * getDistressCategory(0.55) // => 'MODERATE'
 * getDistressCategory(0.1)  // => 'LOW'
 */
export declare function getDistressCategory(level: number): DistressLevel;
/**
 * Get full guidance for a distress level
 *
 * @param level - Distress level from 0 to 1
 * @returns Complete guidance object
 */
export declare function getDistressGuidance(level: number): DistressGuidance;
/**
 * Check if distress level requires priority emotional support
 *
 * @param level - Distress level from 0 to 1
 * @returns True if user needs emotional support first
 */
export declare function needsEmotionalSupport(level: number): boolean;
/**
 * Check if distress level is at crisis level
 *
 * @param level - Distress level from 0 to 1
 * @returns True if user is in crisis
 */
export declare function isCrisis(level: number): boolean;
/**
 * Check if distress level warrants gentle/slow approach
 *
 * @param level - Distress level from 0 to 1
 * @returns True if should use gentle approach
 */
export declare function shouldBeGentle(level: number): boolean;
/**
 * Get suggested tone for distress level
 */
export declare function getSuggestedTone(level: number): DistressGuidance['tone'];
/**
 * Format distress guidance for prompt injection
 *
 * @param level - Distress level from 0 to 1
 * @returns Formatted string for LLM prompt
 */
export declare function formatDistressForPrompt(level: number): string;
declare const _default: {
    DISTRESS: {
        /**
         * CRISIS (0.8+): Immediate intervention required
         * - User may be in panic, crisis, or acute distress
         * - All other concerns are secondary
         * - Focus: Presence, grounding, safety
         */
        readonly CRISIS: 0.8;
        /**
         * HIGH (0.7+): Switch to full support mode
         * - User is clearly struggling
         * - Advice/information should wait
         * - Focus: Validation, empathy, slowing down
         */
        readonly HIGH: 0.7;
        /**
         * MODERATE (0.5+): Acknowledge feelings first
         * - User is experiencing significant emotions
         * - Lead with empathy before any practical discussion
         * - Focus: Validation, then gentle exploration
         */
        readonly MODERATE: 0.5;
        /**
         * ELEVATED (0.4+): Be mindful of emotions
         * - User has some emotional weight
         * - Don't ignore it, but don't over-focus
         * - Focus: Acknowledge and proceed thoughtfully
         */
        readonly ELEVATED: 0.4;
        /**
         * MILD (0.2+): Light emotional awareness
         * - User has minor emotional signals
         * - Normal conversation with emotional awareness
         * - Focus: Natural, warm interaction
         */
        readonly MILD: 0.2;
        /**
         * LOW (< 0.2): Normal conversation
         * - No significant distress detected
         * - Focus: Engage naturally
         */
        readonly LOW: 0;
    };
    DISTRESS_GUIDANCE: Record<"HIGH" | "CRISIS" | "MODERATE" | "ELEVATED" | "MILD" | "LOW", DistressGuidance>;
    getDistressCategory: typeof getDistressCategory;
    getDistressGuidance: typeof getDistressGuidance;
    needsEmotionalSupport: typeof needsEmotionalSupport;
    isCrisis: typeof isCrisis;
    shouldBeGentle: typeof shouldBeGentle;
    getSuggestedTone: typeof getSuggestedTone;
    formatDistressForPrompt: typeof formatDistressForPrompt;
};
export default _default;
//# sourceMappingURL=distress.d.ts.map