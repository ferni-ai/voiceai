/**
 * Progress Metrics - User-Facing Growth Tracking
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Tracks and presents user growth in meaningful ways.
 * Not gamification - genuine reflection on their journey.
 *
 * Philosophy:
 * - Progress is often invisible to the person making it
 * - Numbers alone miss the story
 * - Growth isn't always linear
 *
 * @module ProgressMetrics
 */
export interface ProgressSummary {
    userId: string;
    period: 'week' | 'month' | 'quarter' | 'year';
    periodStart: Date;
    periodEnd: Date;
    engagement: {
        sessionsCount: number;
        totalMinutes: number;
        averageSessionLength: number;
        longestSession: number;
        consistencyScore: number;
    };
    growth: {
        goalsSet: number;
        goalsCompleted: number;
        milestonesReached: number;
        breakthroughMoments: number;
        habitsFormed: number;
    };
    emotional: {
        primaryEmotions: Array<{
            emotion: string;
            frequency: number;
        }>;
        emotionalRange: number;
        vulnerabilityMoments: number;
    };
    topics: {
        mainTopics: string[];
        newTopicsExplored: number;
        deepDiveTopics: string[];
    };
    relationship: {
        trustScore: number;
        personasInteractedWith: string[];
        teamMembersUnlocked: number;
    };
}
export interface GrowthHighlight {
    type: 'goal' | 'milestone' | 'breakthrough' | 'habit' | 'insight';
    date: Date;
    title: string;
    description: string;
    significance: 'notable' | 'significant' | 'major';
}
export interface ProgressProfile {
    userId: string;
    weeklySummaries: ProgressSummary[];
    monthlySummaries: ProgressSummary[];
    highlights: GrowthHighlight[];
    streaks: {
        currentSessionStreak: number;
        longestSessionStreak: number;
        currentGoalStreak: number;
        weeklyConsistency: number[];
    };
    trends: {
        engagementTrend: 'increasing' | 'stable' | 'decreasing';
        emotionalTrend: 'improving' | 'stable' | 'challenging';
        progressRate: number;
    };
}
/**
 * Record a session for progress tracking
 */
export declare function recordProgressSession(userId: string, sessionData: {
    durationMinutes: number;
    topics: string[];
    emotions: string[];
    personaId?: string;
}): void;
/**
 * Record a growth highlight
 */
export declare function recordHighlight(userId: string, highlight: Omit<GrowthHighlight, 'date'>): void;
/**
 * Reset streak (called when session gap is too long)
 */
export declare function resetStreak(userId: string): void;
/**
 * Generate a progress summary for a period
 */
export declare function generateProgressSummary(userId: string, period: 'week' | 'month' | 'quarter'): ProgressSummary | null;
/**
 * Generate a human-readable progress reflection
 */
export declare function generateProgressReflection(userId: string): {
    title: string;
    reflection: string;
    highlights: GrowthHighlight[];
    ssml: string;
} | null;
/**
 * Get streak information for user
 */
export declare function getStreakInfo(userId: string): {
    currentStreak: number;
    longestStreak: number;
    message: string;
};
/**
 * Build LLM context for progress metrics
 */
export declare function buildProgressContext(userId: string): string | null;
export declare function exportProgressProfile(userId: string): ProgressProfile | null;
export declare function importProgressProfile(profile: ProgressProfile): void;
declare const _default: {
    recordProgressSession: typeof recordProgressSession;
    recordHighlight: typeof recordHighlight;
    resetStreak: typeof resetStreak;
    generateProgressSummary: typeof generateProgressSummary;
    generateProgressReflection: typeof generateProgressReflection;
    getStreakInfo: typeof getStreakInfo;
    buildProgressContext: typeof buildProgressContext;
    exportProgressProfile: typeof exportProgressProfile;
    importProgressProfile: typeof importProgressProfile;
};
export default _default;
//# sourceMappingURL=progress-metrics.d.ts.map