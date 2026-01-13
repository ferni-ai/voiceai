/**
 * Emotional Pattern Analysis
 *
 * Superhuman feature: Notice things about users that they don't notice themselves.
 *
 * "I've noticed you seem more stressed when work comes up lately"
 * "Every Sunday evening you seem to get anxious"
 * "When you talk about your boss, your whole energy shifts"
 *
 * Humans miss these patterns because they're self-absorbed or too close.
 * We can see the bigger picture and reflect it back gently.
 *
 * @module personality/pattern-analysis
 */
import { type EmotionalTrend } from './emotional-data.js';
/**
 * Configuration constants for pattern detection
 */
export declare const PATTERN_CONFIG: {
    /** Minimum relevant data points to consider a correlation */
    readonly MIN_RELEVANT_POINTS: 3;
    /** Correlation threshold to detect a pattern (60%) */
    readonly CORRELATION_THRESHOLD: 0.6;
    /** High correlation threshold for immediate surfacing (80%) */
    readonly HIGH_CORRELATION_THRESHOLD: 0.8;
    /** Minimum recent points to detect declining trend */
    readonly MIN_RECENT_POINTS_FOR_TREND: 5;
    /** Minimum negative emotions in recent history to flag declining */
    readonly MIN_NEGATIVE_FOR_DECLINE: 3;
    /** Minimum temporal pattern matches to surface */
    readonly MIN_TEMPORAL_MATCHES: 2;
};
export type DeliveryTiming = 'now' | 'when_relevant' | 'gently_over_time';
export interface EmotionalPattern {
    id: string;
    userId: string;
    pattern: string;
    evidence: string[];
    trend: EmotionalTrend;
    triggers?: string[];
    insight: string;
    deliveryTiming: DeliveryTiming;
    confidence: number;
    detectedAt: Date;
    lastUpdated: Date;
    surfacedToUser: boolean;
}
/** Detected patterns per user */
declare const detectedPatterns: Map<string, EmotionalPattern[]>;
/**
 * Analyze user's emotional history for patterns
 * Called automatically after recording new data points
 */
export declare function analyzeForPatterns(userId: string): void;
/**
 * Get patterns ready to surface to the user
 */
export declare function getPatternInsights(userId: string, options?: {
    maxCount?: number;
    onlyUnsurfaced?: boolean;
}): EmotionalPattern[];
/**
 * Mark a pattern as surfaced
 */
export declare function markPatternSurfaced(patternId: string, userId: string): void;
/**
 * Format pattern insight for prompt injection
 */
export declare function formatPatternForPrompt(pattern: EmotionalPattern): string;
/**
 * Clear detected patterns for a user
 */
export declare function clearUserPatterns(userId: string): void;
/**
 * Clear all detected patterns
 */
export declare function clearAllPatterns(): void;
export { detectedPatterns };
//# sourceMappingURL=pattern-analysis.d.ts.map