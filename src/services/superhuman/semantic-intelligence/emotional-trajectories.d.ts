/**
 * Emotional Trajectory Arcs - Better Than Human Service
 *
 * "See emotional journeys over weeks/months, not just moments"
 *
 * Tracks the semantic trajectory of emotions over multi-week arcs:
 *   - Not just "you felt anxious Tuesday"
 *   - But "your anxiety about career has been building for 3 weeks,
 *     peaked last Thursday, and is now resolving"
 *
 * @module services/superhuman/semantic-intelligence/emotional-trajectories
 */
import type { EmotionalArc, EmotionalWaypoint, ArcPhase } from './types.js';
export type { EmotionalArc, EmotionalWaypoint, ArcPhase };
/**
 * Record an emotional waypoint.
 *
 * Call this whenever a significant emotional moment is detected:
 * - Voice emotion detection
 * - Explicit emotional expression
 * - Topic with emotional charge
 */
export declare function recordEmotionalWaypoint(userId: string, waypoint: {
    emotion: string;
    intensity: number;
    valence: number;
    arousal?: number;
    context?: string;
    trigger?: string;
}): Promise<EmotionalArc | null>;
/**
 * Get active emotional arcs for a user.
 */
export declare function getActiveArcs(userId: string): Promise<EmotionalArc[]>;
/**
 * Get arcs relevant to current emotional context.
 */
export declare function getRelevantArcs(userId: string, currentEmotion?: string, currentTopic?: string): Promise<EmotionalArc[]>;
/**
 * Build context string for LLM injection.
 */
export declare function buildEmotionalTrajectoryContext(userId: string, currentContext?: {
    emotion?: string;
    topic?: string;
}): Promise<string>;
/**
 * Clear arc cache for a user.
 */
export declare function clearArcCache(userId?: string): void;
/**
 * Emotional context result for proactive intelligence.
 * Used by session-init-handler Phase 6.6 for predictive emotional state.
 */
export interface EmotionalContextResult {
    /** Currently active emotional arcs */
    activeArcs: EmotionalArc[];
    /** The dominant emotional trajectory theme */
    dominantTrajectory?: string;
    /** Predicted phase for the dominant arc */
    predictedPhase?: ArcPhase;
    /** Recommendation for how to approach the user */
    recommendation?: string;
    /** Overall emotional trend direction */
    trend?: 'improving' | 'declining' | 'stable' | 'volatile';
    /** Intensity level (0-1) */
    intensity?: number;
}
/**
 * Get emotional context for proactive intelligence.
 * Analyzes active emotional arcs to predict user's emotional state
 * and provide recommendations for engagement.
 *
 * @param userId - The user ID
 * @returns Emotional context with arcs, trajectory, and recommendations
 */
export declare function getEmotionalContext(userId: string): Promise<EmotionalContextResult>;
export declare const emotionalTrajectories: {
    recordWaypoint: typeof recordEmotionalWaypoint;
    getActiveArcs: typeof getActiveArcs;
    getRelevantArcs: typeof getRelevantArcs;
    buildContext: typeof buildEmotionalTrajectoryContext;
    clearCache: typeof clearArcCache;
    getEmotionalContext: typeof getEmotionalContext;
};
//# sourceMappingURL=emotional-trajectories.d.ts.map