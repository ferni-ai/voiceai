/**
 * Pattern Persistence Service
 *
 * Persists emotional patterns to Firestore for cross-session insights.
 * This enables "superhuman" observations like:
 * - "I've noticed you seem more stressed when work comes up"
 * - "Every Sunday evening you seem anxious"
 *
 * Uses a dedicated Firestore collection for emotional data.
 *
 * @module personality/pattern-persistence
 */
import type { EmotionalDataPoint, EmotionalPattern, GrowthMoment } from './emotional-patterns.js';
/**
 * Save an emotional data point to Firestore
 */
export declare function saveEmotionalDataPoint(userId: string, dataPoint: EmotionalDataPoint): Promise<boolean>;
/**
 * Get emotional data points for a user (for pattern analysis)
 */
export declare function getEmotionalDataPoints(userId: string, options?: {
    limit?: number;
    since?: Date;
}): Promise<EmotionalDataPoint[]>;
/**
 * Save or update an emotional pattern
 */
export declare function saveEmotionalPattern(userId: string, pattern: EmotionalPattern): Promise<boolean>;
/**
 * Get patterns for a user
 */
export declare function getEmotionalPatterns(userId: string, options?: {
    onlyUnsurfaced?: boolean;
    minConfidence?: number;
}): Promise<EmotionalPattern[]>;
/**
 * Mark a pattern as surfaced to the user
 */
export declare function markPatternSurfaced(userId: string, patternId: string): Promise<boolean>;
/**
 * Save a growth moment
 */
export declare function saveGrowthMoment(userId: string, growth: GrowthMoment): Promise<boolean>;
/**
 * Get growth moments for a user
 */
export declare function getGrowthMoments(userId: string, options?: {
    onlyUnsurfaced?: boolean;
}): Promise<GrowthMoment[]>;
/**
 * Mark a growth moment as surfaced (celebrated)
 */
export declare function markGrowthSurfaced(userId: string, growthId: string): Promise<boolean>;
declare const _default: {
    saveEmotionalDataPoint: typeof saveEmotionalDataPoint;
    getEmotionalDataPoints: typeof getEmotionalDataPoints;
    saveEmotionalPattern: typeof saveEmotionalPattern;
    getEmotionalPatterns: typeof getEmotionalPatterns;
    markPatternSurfaced: typeof markPatternSurfaced;
    saveGrowthMoment: typeof saveGrowthMoment;
    getGrowthMoments: typeof getGrowthMoments;
    markGrowthSurfaced: typeof markGrowthSurfaced;
};
export default _default;
//# sourceMappingURL=pattern-persistence.d.ts.map