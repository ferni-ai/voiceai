/**
 * Emotional Semantics - Shim Module
 *
 * Provides a simplified interface to emotional trajectory data
 * for the awareness context builders.
 *
 * @module services/superhuman/semantic-intelligence/emotional-semantics
 */
/**
 * Result from getEmotionalTrajectory
 */
export interface EmotionalTrajectoryResult {
    dominantEmotion?: string;
    trend?: 'improving' | 'declining' | 'stable' | 'volatile';
    durationDescription?: string;
    recentEmotions?: string[];
    avgDistress?: number;
    patterns?: string[];
    alerts?: string[];
}
/**
 * Get emotional trajectory for a user.
 * Simplified wrapper around getEmotionalContext for backward compatibility.
 *
 * @param userId - The user ID
 * @returns Emotional trajectory or null if unavailable
 */
export declare function getEmotionalTrajectory(userId: string): Promise<EmotionalTrajectoryResult | null>;
//# sourceMappingURL=emotional-semantics.d.ts.map