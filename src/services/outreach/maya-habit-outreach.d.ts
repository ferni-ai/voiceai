/**
 * Maya's Habit Outreach System
 *
 * > "I've seen the pattern. I know what's coming. Let me help before you fall."
 *
 * Maya-specific proactive outreach for habits:
 *
 * 1. **Streak Protection** - Alert before a streak breaks
 * 2. **Weekly Review** - Reflective habit check-in
 * 3. **Setback Recovery** - Gentle reconnection after missed days
 * 4. **Milestone Celebration** - 7, 21, 30, 66, 100 day streaks
 * 5. **Predictive Challenge** - Holidays, travel, stress periods
 *
 * @module services/outreach/maya-habit-outreach
 */
export interface HabitOutreachContext {
    userId: string;
    habitId?: string;
    habitName?: string;
    streakDays?: number;
    missedDays?: number;
    completionRate?: number;
    reason: string;
}
export interface StreakAtRiskResult {
    atRisk: boolean;
    habits: Array<{
        id: string;
        name: string;
        streakDays: number;
        lastCompleted: Date | null;
    }>;
}
declare const CONFIG: {
    /** Streak length that triggers protection alerts */
    streakProtectionThreshold: number;
    /** Hour of day to send evening streak alerts (24h format) */
    eveningAlertHour: number;
    /** Day of week for weekly review (0 = Sunday) */
    weeklyReviewDay: number;
    /** Hour for weekly review */
    weeklyReviewHour: number;
    /** Milestone days to celebrate */
    milestoneDays: number[];
    /** Days missed before setback recovery outreach */
    setbackRecoveryDays: number;
};
/**
 * Check if user has any streaks at risk of breaking today
 */
export declare function checkStreaksAtRisk(userId: string): Promise<StreakAtRiskResult>;
/**
 * Publish streak protection outreach trigger
 */
export declare function publishStreakProtectionAlert(context: HabitOutreachContext): Promise<boolean>;
/**
 * Check for new milestones to celebrate
 */
export declare function checkMilestonesToCelebrate(userId: string): Promise<Array<{
    habitId: string;
    habitName: string;
    days: number;
}>>;
/**
 * Publish milestone celebration trigger
 */
export declare function publishMilestoneCelebration(userId: string, habitId: string, habitName: string, days: number): Promise<boolean>;
/**
 * Generate weekly habit review data
 */
export declare function generateWeeklyReviewData(userId: string): Promise<{
    totalHabits: number;
    completedThisWeek: number;
    missedThisWeek: number;
    completionRate: number;
    bestStreak: {
        name: string;
        days: number;
    } | null;
    improvingHabits: string[];
    strugglingHabits: string[];
} | null>;
/**
 * Publish weekly review trigger
 */
export declare function publishWeeklyReviewTrigger(userId: string): Promise<boolean>;
/**
 * Check for habits that need setback recovery outreach
 */
export declare function checkSetbackRecoveryNeeded(userId: string): Promise<Array<{
    habitId: string;
    habitName: string;
    daysMissed: number;
    previousStreak: number;
}>>;
/**
 * Publish setback recovery trigger
 */
export declare function publishSetbackRecoveryTrigger(userId: string, habitId: string, habitName: string, daysMissed: number, previousStreak: number): Promise<boolean>;
/**
 * Maya's voice for streak protection messages
 */
export declare const MAYA_STREAK_PROTECTION_MESSAGES: string[];
/**
 * Maya's voice for milestone celebrations
 */
export declare const MAYA_MILESTONE_MESSAGES: Record<number, string[]>;
/**
 * Maya's voice for weekly reviews
 */
export declare const MAYA_WEEKLY_REVIEW_MESSAGES: {
    great: string[];
    okay: string[];
    struggling: string[];
};
/**
 * Maya's voice for setback recovery
 */
export declare const MAYA_SETBACK_MESSAGES: string[];
export { CONFIG as MAYA_HABIT_OUTREACH_CONFIG };
//# sourceMappingURL=maya-habit-outreach.d.ts.map