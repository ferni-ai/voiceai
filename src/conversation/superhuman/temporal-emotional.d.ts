/**
 * Temporal Emotional Intelligence
 *
 * > "You sound lighter today than last week."
 *
 * Compares emotional states across time with perfect recall.
 * Unlike humans, we notice subtle shifts and can articulate them.
 *
 * Key capabilities:
 * - Session emotion tracking
 * - Trajectory analysis
 * - Notable shift detection
 * - Time-comparative observations
 *
 * @module @ferni/superhuman/temporal-emotional
 */
import type { TemporalEmotionalProfile, TemporalInsight } from './types.js';
export declare class TemporalEmotionalEngine {
    private profile;
    private userId;
    private lastInsightTurn;
    constructor(userId: string, existing?: TemporalEmotionalProfile);
    /**
     * Record session emotional snapshot
     */
    recordSessionEmotion(snapshot: {
        dominantEmotion: string;
        energyLevel: number;
        positivity: number;
        openness?: number;
        topics: string[];
        concernsDetected: boolean;
    }): void;
    /**
     * Get temporal insight if appropriate
     */
    getTemporalInsight(context: {
        turnCount: number;
        currentEnergy: number;
        currentPositivity: number;
        currentOpenness?: number;
        sessionCount: number;
    }): TemporalInsight;
    /**
     * Get comparative observation about current state vs history
     */
    getComparativeObservation(currentEmotion: string, currentTopic?: string): string | null;
    private checkEnergyComparison;
    private checkMoodShift;
    private checkGrowthObservation;
    /**
     * Check for openness comparison with recent sessions
     */
    private checkOpennessComparison;
    /**
     * Check for openness growth over time (longer-term pattern)
     */
    private checkOpennessGrowth;
    private updateBaseline;
    /**
     * Infer openness level from session characteristics
     * Openness reflects how vulnerable/sharing the user was
     */
    private inferOpenness;
    private updateTrajectory;
    private detectShifts;
    private calculateVariance;
    private selectRandom;
    /**
     * Get trajectory
     */
    getTrajectory(): TemporalEmotionalProfile['trajectory'];
    /**
     * Get baseline
     */
    getBaseline(): TemporalEmotionalProfile['baseline'];
    /**
     * Export for persistence
     */
    export(): TemporalEmotionalProfile;
    /**
     * Import from persistence
     */
    import(profile: TemporalEmotionalProfile): void;
    /**
     * Reset
     */
    reset(): void;
}
export declare function getTemporalEmotional(userId: string, existing?: TemporalEmotionalProfile): TemporalEmotionalEngine;
export declare function clearTemporalEmotional(userId: string): void;
export default TemporalEmotionalEngine;
//# sourceMappingURL=temporal-emotional.d.ts.map