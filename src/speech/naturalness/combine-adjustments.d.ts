/**
 * Combine Adjustments
 *
 * Merges TTS adjustments from multiple naturalness systems with proper
 * priority and clamping to avoid over-adjustment.
 *
 * @module naturalness/combine-adjustments
 */
import type { CombinedTtsAdjustments, ContextInjection } from './types.js';
export declare const COMBINE_CONFIG: {
    /** Speed limits */
    SPEED: {
        MIN: number;
        MAX: number;
        DEFAULT: number;
    };
    /** Volume boost limits */
    VOLUME_BOOST: {
        MIN: number;
        MAX: number;
        DEFAULT: number;
    };
    /** Extra pause limits (ms) */
    EXTRA_PAUSE: {
        MIN: number;
        MAX: number;
        DEFAULT: number;
    };
};
/**
 * Adjustments from a single source system
 */
export interface SourceAdjustments {
    /** Source system name */
    source: 'stress' | 'patterns' | 'ambient' | 'rapport';
    /** Speed multiplier (optional) */
    speedMultiplier?: number;
    /** Volume boost (optional) */
    volumeBoost?: number;
    /** Clarity mode (optional) */
    clarityMode?: boolean;
    /** Extra pause (optional, ms) */
    extraPauseMs?: number;
    /** Warmth level (optional) */
    warmthLevel?: 'neutral' | 'warm' | 'very_warm';
    /** Reason for adjustment */
    reason: string;
    /** Priority (higher = takes precedence for conflicting values) */
    priority: number;
}
/**
 * Combine adjustments from multiple sources
 *
 * Priority rules:
 * - Speed: Weighted average of all sources
 * - Volume: Max of all sources (loudest wins for audibility)
 * - Clarity: OR of all sources (if any needs clarity, enable it)
 * - Pause: Max of all sources (longest pause wins for comprehension)
 * - Warmth: Highest warmth level wins
 */
export declare function combineAdjustments(sources: SourceAdjustments[]): CombinedTtsAdjustments;
/**
 * Merge context injections, prioritizing by priority score
 */
export declare function mergeContextInjections(injections: ContextInjection[]): ContextInjection[];
//# sourceMappingURL=combine-adjustments.d.ts.map