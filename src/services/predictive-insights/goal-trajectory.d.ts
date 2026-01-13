/**
 * Goal Trajectory Alerts
 *
 * > "At your current pace, you'll hit your savings goal 3 weeks late."
 *
 * Projects goal completion dates based on current progress rate
 * and suggests course corrections when off track.
 *
 * Features:
 * - Progress rate calculation
 * - Completion date projection
 * - Course correction suggestions
 * - Milestone predictions
 *
 * @module PredictiveInsights/GoalTrajectory
 */
import type { CourseCorrection } from './types.js';
export interface GoalTrajectory {
    userId: string;
    goalId: string;
    goalName: string;
    /** Current progress (0-100) */
    currentProgress: number;
    /** Target progress by now */
    targetProgress: number;
    /** Original deadline */
    originalDeadline: Date;
    /** Projected completion date at current pace */
    projectedCompletion: Date;
    /** Days ahead (+) or behind (-) schedule */
    daysOff: number;
    /** Is the goal on track? */
    onTrack: boolean;
    /** Suggested course correction */
    courseCorrection?: CourseCorrection;
    /** Human-friendly message */
    message: string;
    /** Actionable suggestion */
    suggestion: string;
    /** Confidence in projection (0-1) */
    confidence: number;
    /** Should surface to user */
    shouldSurface: boolean;
}
interface GoalProgress {
    goalId: string;
    goalName: string;
    goalType: 'savings' | 'habit' | 'project' | 'health' | 'learning' | 'other';
    targetValue: number;
    currentValue: number;
    unit: string;
    deadline: Date;
    createdAt: Date;
    progressHistory: Array<{
        date: Date;
        value: number;
    }>;
}
/**
 * Project trajectories for all user goals
 */
export declare function projectGoalTrajectory(userId: string): Promise<GoalTrajectory[]>;
/**
 * Record goal progress update
 */
export declare function recordGoalProgress(userId: string, goalId: string, currentValue: number): void;
/**
 * Add a new goal to track
 */
export declare function addGoalToTrack(userId: string, goal: Omit<GoalProgress, 'progressHistory'>): void;
/**
 * Clear goal data for a user
 */
export declare function clearGoalData(userId: string): void;
declare const _default: {
    projectGoalTrajectory: typeof projectGoalTrajectory;
    recordGoalProgress: typeof recordGoalProgress;
    addGoalToTrack: typeof addGoalToTrack;
    clearGoalData: typeof clearGoalData;
};
export default _default;
//# sourceMappingURL=goal-trajectory.d.ts.map