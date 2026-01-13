/**
 * Journey Tracking & Reflection
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Tracks the user's journey over time and creates meaningful reflection moments.
 * "Look how far you've come."
 *
 * Philosophy:
 * - Progress is often invisible to the person making it
 * - Milestones deserve acknowledgment
 * - The journey matters as much as the destination
 *
 * @module JourneyTracking
 */
export type MilestoneType = 'session_count' | 'time_duration' | 'goal_completed' | 'breakthrough_moment' | 'growth_acknowledged' | 'habit_streak' | 'challenge_overcome';
export interface JourneyMilestone {
    id: string;
    userId: string;
    type: MilestoneType;
    title: string;
    description: string;
    achievedAt: Date;
    celebrated: boolean;
    celebrationNote?: string;
}
export interface JourneySnapshot {
    date: Date;
    sessionCount: number;
    activeGoals: number;
    completedGoals: number;
    topTopics: string[];
    emotionalTone: string;
    keyMoment?: string;
}
export interface JourneyProfile {
    userId: string;
    firstSessionDate: Date;
    totalSessions: number;
    milestones: JourneyMilestone[];
    snapshots: JourneySnapshot[];
    metrics: {
        goalsCompleted: number;
        milestonesAchieved: number;
        breakthroughMoments: number;
        topicsExplored: string[];
    };
    lastUpdated: Date;
}
export interface JourneyReflection {
    type: 'milestone' | 'progress' | 'growth';
    title: string;
    content: string;
    ssml: string;
    dataPoints: string[];
}
/**
 * Record a new session and check for milestones
 */
export declare function recordSession(userId: string, sessionData?: {
    topics?: string[];
    emotionalTone?: string;
    keyMoment?: string;
}): JourneyMilestone | null;
/**
 * Record a goal completion as a journey milestone
 */
export declare function recordGoalCompletion(userId: string, goalTitle: string): JourneyMilestone;
/**
 * Record a breakthrough moment
 */
export declare function recordBreakthrough(userId: string, description: string): JourneyMilestone;
/**
 * Mark a milestone as celebrated
 */
export declare function markMilestoneCelebrated(userId: string, milestoneId: string, note?: string): void;
/**
 * Generate a journey reflection for the user
 */
export declare function generateJourneyReflection(userId: string): JourneyReflection | null;
/**
 * Get journey summary for a user
 */
export declare function getJourneySummary(userId: string): {
    daysTogether: number;
    totalSessions: number;
    goalsCompleted: number;
    milestonesAchieved: number;
    topicsCount: number;
} | null;
/**
 * Build LLM context for journey
 */
export declare function buildJourneyContext(userId: string): string | null;
export declare function exportJourneyProfile(userId: string): JourneyProfile | null;
export declare function importJourneyProfile(profile: JourneyProfile): void;
declare const _default: {
    recordSession: typeof recordSession;
    recordGoalCompletion: typeof recordGoalCompletion;
    recordBreakthrough: typeof recordBreakthrough;
    markMilestoneCelebrated: typeof markMilestoneCelebrated;
    generateJourneyReflection: typeof generateJourneyReflection;
    getJourneySummary: typeof getJourneySummary;
    buildJourneyContext: typeof buildJourneyContext;
    exportJourneyProfile: typeof exportJourneyProfile;
    importJourneyProfile: typeof importJourneyProfile;
};
export default _default;
//# sourceMappingURL=journey-tracking.d.ts.map