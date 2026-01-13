/**
 * Emotional Pattern Recognition
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
 * ## Architecture (2024-12)
 *
 * This module is split into focused sub-modules:
 * - `emotional-data.ts` - Data collection and storage
 * - `pattern-analysis.ts` - Pattern detection algorithms
 * - `growth-tracking.ts` - Growth moment tracking
 *
 * This file re-exports everything for backwards compatibility.
 *
 * @module personality/emotional-patterns
 */
export type { EmotionalDataPoint, EmotionalTrend } from './emotional-data.js';
export type { DeliveryTiming, EmotionalPattern } from './pattern-analysis.js';
export type { GrowthMoment } from './growth-tracking.js';
export { EMOTIONAL_DATA_CONFIG, clearAllEmotionalData, clearUserEmotionalData, getEmotionalDataStats, getEmotionalHistory, hasEnoughHistoryForPatterns, emotionalHistory, } from './emotional-data.js';
export { PATTERN_CONFIG, analyzeForPatterns, clearAllPatterns, clearUserPatterns, detectedPatterns, formatPatternForPrompt, getPatternInsights, markPatternSurfaced, } from './pattern-analysis.js';
export { clearAllGrowthMoments, clearUserGrowthMoments, formatGrowthForPrompt, getGrowthCelebrations, growthMoments, markGrowthSurfaced, recordGrowthEvidence, } from './growth-tracking.js';
/**
 * Record an emotional data point and trigger pattern analysis
 *
 * This is the main entry point for recording emotional data.
 * It records the data point and then analyzes for patterns.
 */
export declare function recordEmotionalDataPoint(userId: string, emotion: string, intensity: number, topics: string[], context?: string): void;
/**
 * Clear all emotional tracking data for a user
 *
 * Call this on session end to prevent memory leaks in long-running processes.
 * This clears:
 * - Emotional history
 * - Detected patterns
 * - Growth moments
 */
export declare function clearAllUserEmotionalTracking(userId: string): void;
/**
 * Get current memory usage stats for emotional tracking
 */
export declare function getEmotionalTrackingStats(): {
    emotionalData: {
        userCount: number;
        totalDataPoints: number;
        averagePointsPerUser: number;
    };
    patterns: {
        userCount: number;
    };
    growth: {
        userCount: number;
    };
};
//# sourceMappingURL=emotional-patterns.d.ts.map