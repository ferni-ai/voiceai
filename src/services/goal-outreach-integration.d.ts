/**
 * Goal + Outreach Integration
 *
 * Connects Maya's habit/goal tracking with proactive outreach:
 * - Streak at risk alerts
 * - Goal milestone celebrations
 * - Missed check-in nudges
 * - Progress encouragement
 *
 * Works with the outreach intelligence system to send timely,
 * contextual messages that support user goals.
 *
 * PERSISTENCE: Goals and streaks are persisted to Firestore.
 */
export interface Goal {
    id: string;
    userId: string;
    title: string;
    description?: string;
    targetDate?: Date;
    progress: number;
    status: 'active' | 'completed' | 'paused' | 'abandoned';
    milestones: GoalMilestone[];
    createdAt: Date;
    updatedAt: Date;
}
export interface GoalMilestone {
    id: string;
    title: string;
    targetProgress: number;
    reached: boolean;
    reachedAt?: Date;
    celebrationSent: boolean;
}
export interface Streak {
    id: string;
    userId: string;
    habitName: string;
    currentStreak: number;
    longestStreak: number;
    lastCheckIn: Date;
    checkInFrequency: 'daily' | 'weekly';
    atRisk: boolean;
    riskAlertSent: boolean;
}
export interface HabitCheckIn {
    userId: string;
    habitName: string;
    completed: boolean;
    timestamp: Date;
    notes?: string;
}
/**
 * Record a habit check-in and update streak
 */
export declare function recordCheckIn(checkIn: HabitCheckIn): Promise<{
    streak: Streak;
    celebration?: string;
}>;
/**
 * Check for at-risk streaks and send alerts
 */
export declare function checkAtRiskStreaks(): Promise<number>;
/**
 * Create a new goal
 */
export declare function createGoal(params: {
    userId: string;
    title: string;
    description?: string;
    targetDate?: Date;
    milestones?: Array<{
        title: string;
        targetProgress: number;
    }>;
}): Promise<Goal>;
/**
 * Update goal progress and check for milestone celebrations
 */
export declare function updateGoalProgress(userId: string, goalId: string, newProgress: number): Promise<{
    goal: Goal;
    milestonesReached: GoalMilestone[];
    celebration?: string;
}>;
/**
 * Get user's active goals
 */
export declare function getActiveGoals(userId: string): Promise<Goal[]>;
/**
 * Check for goals at risk (deadline approaching)
 */
export declare function checkGoalDeadlines(): Promise<number>;
/**
 * Check for users who haven't engaged and send nudges
 */
export declare function sendMissedCheckInNudges(maxDaysSinceContact?: number): Promise<number>;
/**
 * Start the goal monitoring background job
 */
export declare function startGoalMonitoring(intervalMs?: number): void;
/**
 * Stop the goal monitoring background job
 */
export declare function stopGoalMonitoring(): void;
/**
 * Flush all pending persistence writes
 */
export declare function flushGoalOutreachPersistence(): Promise<void>;
/**
 * Shutdown the goal outreach service
 */
export declare function shutdownGoalOutreach(): Promise<void>;
declare const _default: {
    recordCheckIn: typeof recordCheckIn;
    checkAtRiskStreaks: typeof checkAtRiskStreaks;
    createGoal: typeof createGoal;
    updateGoalProgress: typeof updateGoalProgress;
    getActiveGoals: typeof getActiveGoals;
    checkGoalDeadlines: typeof checkGoalDeadlines;
    startGoalMonitoring: typeof startGoalMonitoring;
    stopGoalMonitoring: typeof stopGoalMonitoring;
    flushGoalOutreachPersistence: typeof flushGoalOutreachPersistence;
    shutdownGoalOutreach: typeof shutdownGoalOutreach;
};
export default _default;
//# sourceMappingURL=goal-outreach-integration.d.ts.map