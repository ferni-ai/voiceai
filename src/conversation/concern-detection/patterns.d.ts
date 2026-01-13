/**
 * Concern Detection Linguistic Patterns
 *
 * Regex patterns for detecting various types of concern in user messages.
 * These are evidence-based patterns that indicate emotional states.
 *
 * @module @ferni/conversation/concern-detection/patterns
 */
import type { ConcernType } from './types.js';
/** Patterns that indicate anxiety */
export declare const ANXIETY_PATTERNS: RegExp[];
/** Patterns that indicate sadness/depression */
export declare const SADNESS_PATTERNS: RegExp[];
/** Patterns that indicate overwhelm */
export declare const OVERWHELM_PATTERNS: RegExp[];
/** Patterns that indicate frustration/anger */
export declare const FRUSTRATION_PATTERNS: RegExp[];
/** Patterns that indicate loneliness */
export declare const LONELINESS_PATTERNS: RegExp[];
/** Patterns that indicate exhaustion */
export declare const EXHAUSTION_PATTERNS: RegExp[];
/** Patterns that indicate self-doubt */
export declare const SELF_DOUBT_PATTERNS: RegExp[];
/** Patterns that indicate hopelessness - ELEVATED CONCERN */
export declare const HOPELESSNESS_PATTERNS: RegExp[];
/** CRISIS PATTERNS - require immediate safety response */
export declare const CRISIS_PATTERNS: RegExp[];
/** Negative spiral indicators (absolutist language) */
export declare const ABSOLUTIST_PATTERNS: RegExp[];
export interface PatternCheck {
    patterns: RegExp[];
    type: ConcernType;
    weight: number;
}
/**
 * Ordered list of pattern checks (crisis first, then by severity)
 */
export declare const PATTERN_CHECKS: PatternCheck[];
/**
 * Weights for different signal sources in scoring
 */
export declare const SOURCE_WEIGHTS: Record<string, number>;
//# sourceMappingURL=patterns.d.ts.map