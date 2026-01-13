/**
 * Goal Tracking Service
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Structured goal-setting with follow-up - the core of life coaching.
 * Helps users define SMART goals, breaks them into milestones,
 * and proactively checks in on progress.
 *
 * Philosophy:
 * - Goals are not just tasks - they represent what matters
 * - Progress over perfection
 * - Celebrate wins, explore obstacles with curiosity
 * - Accountability with compassion
 *
 * @module GoalTracking
 */
export type GoalDomain = 'career' | 'health' | 'relationships' | 'finance' | 'personal_growth' | 'habits' | 'creativity' | 'education' | 'other';
export type GoalStatus = 'active' | 'paused' | 'completed' | 'abandoned';
export type MilestoneStatus = 'pending' | 'in_progress' | 'completed' | 'skipped';
export interface Milestone {
    id: string;
    title: string;
    description?: string;
    dueDate?: Date;
    status: MilestoneStatus;
    completedAt?: Date;
    notes: string[];
    checkInScheduled?: Date;
}
export interface CoachingGoal {
    id: string;
    userId: string;
    personaId: string;
    title: string;
    description: string;
    domain: GoalDomain;
    motivation: string;
    obstacles: string[];
    smart?: {
        specific?: string;
        measurable?: string;
        achievable?: string;
        relevant?: string;
        timebound?: Date;
    };
    milestones: Milestone[];
    currentMilestoneIndex: number;
    progress: number;
    status: GoalStatus;
    createdAt: Date;
    updatedAt: Date;
    completedAt?: Date;
    conversationId?: string;
    relatedTopics: string[];
    checkInFrequency: 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'none';
    nextCheckIn?: Date;
    lastCheckIn?: Date;
}
export interface GoalProgress {
    goalId: string;
    date: Date;
    progress: number;
    note?: string;
    milestoneCompleted?: string;
}
export interface GoalProfile {
    userId: string;
    goals: CoachingGoal[];
    progressHistory: GoalProgress[];
    preferences: {
        checkInStyle: 'direct' | 'gentle' | 'celebratory';
        preferredCheckInTime?: string;
        reminderChannel: 'voice' | 'notification' | 'both';
    };
    stats: {
        totalGoalsSet: number;
        goalsCompleted: number;
        milestonesCompleted: number;
        currentStreak: number;
    };
}
export interface GoalCheckIn {
    goalId: string;
    question: string;
    ssml: string;
    tone: 'curious' | 'celebratory' | 'supportive' | 'direct';
    context: {
        lastProgress: number;
        daysSinceUpdate: number;
        currentMilestone?: string;
    };
}
/**
 * Detect a potential goal in user speech
 */
export declare function detectGoalStatement(userId: string, userMessage: string): {
    detected: boolean;
    goalText?: string;
    domain?: GoalDomain;
};
/**
 * Create a new goal
 */
export declare function createGoal(userId: string, goalData: {
    title: string;
    description?: string;
    domain: GoalDomain;
    motivation?: string;
    obstacles?: string[];
    targetDate?: Date;
    personaId?: string;
}): CoachingGoal;
/**
 * Add a milestone to a goal
 */
export declare function addMilestone(userId: string, goalId: string, milestoneData: {
    title: string;
    description?: string;
    dueDate?: Date;
}): Milestone | null;
/**
 * Update goal progress
 */
export declare function updateProgress(userId: string, goalId: string, progress: number, note?: string): boolean;
/**
 * Complete a milestone
 */
export declare function completeMilestone(userId: string, goalId: string, milestoneId: string): boolean;
/**
 * Pause a goal
 */
export declare function pauseGoal(userId: string, goalId: string, reason?: string): boolean;
/**
 * Resume a paused goal
 */
export declare function resumeGoal(userId: string, goalId: string): boolean;
/**
 * Abandon a goal (with compassion - no shame)
 */
export declare function abandonGoal(userId: string, goalId: string, reason?: string): boolean;
/**
 * Get all active goals for a user
 */
export declare function getActiveGoals(userId: string): CoachingGoal[];
/**
 * Get goals that need check-in
 */
export declare function getGoalsNeedingCheckIn(userId: string): CoachingGoal[];
/**
 * Get a specific goal
 */
export declare function getGoal(userId: string, goalId: string): CoachingGoal | null;
/**
 * Get goal stats for a user
 */
export declare function getGoalStats(userId: string): GoalProfile['stats'] | null;
/**
 * Get recent progress for a goal
 */
export declare function getRecentProgress(userId: string, goalId: string, days?: number): GoalProgress[];
/**
 * Generate a check-in question for a goal
 */
export declare function generateGoalCheckIn(userId: string, goalId: string): GoalCheckIn | null;
/**
 * Get the highest priority goal to check in on
 */
export declare function getGoalToCheckIn(userId: string): {
    goal: CoachingGoal;
    checkIn: GoalCheckIn;
} | null;
/**
 * Export goal profile for persistence
 */
export declare function exportGoalProfile(userId: string): GoalProfile | null;
/**
 * Import goal profile from persistence
 */
export declare function importGoalProfile(profile: GoalProfile): void;
/**
 * Build LLM context for goals
 */
export declare function buildGoalContext(userId: string): string | null;
declare const _default: {
    detectGoalStatement: typeof detectGoalStatement;
    createGoal: typeof createGoal;
    addMilestone: typeof addMilestone;
    updateProgress: typeof updateProgress;
    completeMilestone: typeof completeMilestone;
    pauseGoal: typeof pauseGoal;
    resumeGoal: typeof resumeGoal;
    abandonGoal: typeof abandonGoal;
    getActiveGoals: typeof getActiveGoals;
    getGoalsNeedingCheckIn: typeof getGoalsNeedingCheckIn;
    getGoal: typeof getGoal;
    getGoalStats: typeof getGoalStats;
    getRecentProgress: typeof getRecentProgress;
    generateGoalCheckIn: typeof generateGoalCheckIn;
    getGoalToCheckIn: typeof getGoalToCheckIn;
    buildGoalContext: typeof buildGoalContext;
    exportGoalProfile: typeof exportGoalProfile;
    importGoalProfile: typeof importGoalProfile;
};
export default _default;
//# sourceMappingURL=goal-tracking.d.ts.map