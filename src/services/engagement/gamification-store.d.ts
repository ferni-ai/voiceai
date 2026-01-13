/**
 * Maya Gamification Store
 *
 * Dedicated Firestore-backed storage for Maya's gamification system.
 * Uses subcollections for better querying and scalability:
 *
 * users/{userId}/
 *   maya_gamification/
 *     profile (single doc)
 *     badges/{badgeId}
 *     challenges/{challengeId}
 *     achievements/{achievementId}
 *     mood_logs/{logId}
 *     behavior_tools/{toolId}
 *
 * maya_leaderboards/
 *   global/
 *     weekly_xp
 *     monthly_xp
 *     all_time_xp
 *   by_domain/{domainId}
 */
import { z } from 'zod';
export declare const EarnedBadgeSchema: z.ZodObject<{
    id: z.ZodString;
    badgeId: z.ZodString;
    userId: z.ZodString;
    earnedAt: z.ZodString;
    rarity: z.ZodEnum<{
        rare: "rare";
        common: "common";
        uncommon: "uncommon";
        epic: "epic";
        legendary: "legendary";
    }>;
    category: z.ZodString;
    xpAwarded: z.ZodDefault<z.ZodNumber>;
}, z.core.$strip>;
export type EarnedBadge = z.infer<typeof EarnedBadgeSchema>;
export declare const GamificationProfileSchema: z.ZodObject<{
    userId: z.ZodString;
    totalXP: z.ZodDefault<z.ZodNumber>;
    level: z.ZodDefault<z.ZodNumber>;
    currentTitle: z.ZodDefault<z.ZodString>;
    titleTier: z.ZodDefault<z.ZodNumber>;
    badgeCount: z.ZodDefault<z.ZodNumber>;
    challengesCompleted: z.ZodDefault<z.ZodNumber>;
    stats: z.ZodObject<{
        totalHabitsCreated: z.ZodDefault<z.ZodNumber>;
        totalCompletions: z.ZodDefault<z.ZodNumber>;
        longestStreak: z.ZodDefault<z.ZodNumber>;
        currentStreak: z.ZodDefault<z.ZodNumber>;
        domainsExplored: z.ZodDefault<z.ZodArray<z.ZodString>>;
        behaviorToolsUsed: z.ZodDefault<z.ZodArray<z.ZodString>>;
        comebacks: z.ZodDefault<z.ZodNumber>;
        weeklyReflections: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strip>;
    preferences: z.ZodDefault<z.ZodObject<{
        showOnLeaderboard: z.ZodDefault<z.ZodBoolean>;
        displayName: z.ZodOptional<z.ZodString>;
        shareProgress: z.ZodDefault<z.ZodBoolean>;
    }, z.core.$strip>>;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
    lastActiveAt: z.ZodString;
}, z.core.$strip>;
export type GamificationProfile = z.infer<typeof GamificationProfileSchema>;
export declare const ChallengeProgressSchema: z.ZodObject<{
    id: z.ZodString;
    challengeType: z.ZodString;
    userId: z.ZodString;
    status: z.ZodEnum<{
        active: "active";
        completed: "completed";
        abandoned: "abandoned";
    }>;
    startDate: z.ZodString;
    endDate: z.ZodOptional<z.ZodString>;
    currentDay: z.ZodNumber;
    totalDays: z.ZodDefault<z.ZodNumber>;
    completedDays: z.ZodArray<z.ZodNumber>;
    skippedDays: z.ZodDefault<z.ZodArray<z.ZodNumber>>;
    actions: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodAny>>;
    notes: z.ZodOptional<z.ZodString>;
    xpEarned: z.ZodDefault<z.ZodNumber>;
}, z.core.$strip>;
export type ChallengeProgress = z.infer<typeof ChallengeProgressSchema>;
export declare const BehaviorToolUsageSchema: z.ZodObject<{
    id: z.ZodString;
    toolType: z.ZodEnum<{
        accountability: "accountability";
        four_tendencies: "four_tendencies";
        identity_shift: "identity_shift";
        habit_break: "habit_break";
        environment_design: "environment_design";
        temptation_bundle: "temptation_bundle";
        setback_recovery: "setback_recovery";
        habit_audit: "habit_audit";
        circle_of_influence: "circle_of_influence";
    }>;
    userId: z.ZodString;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
    data: z.ZodRecord<z.ZodString, z.ZodAny>;
    status: z.ZodDefault<z.ZodEnum<{
        active: "active";
        completed: "completed";
        paused: "paused";
    }>>;
}, z.core.$strip>;
export type BehaviorToolUsage = z.infer<typeof BehaviorToolUsageSchema>;
export declare const MoodLogSchema: z.ZodObject<{
    id: z.ZodString;
    userId: z.ZodString;
    date: z.ZodString;
    mood: z.ZodNumber;
    energy: z.ZodNumber;
    notes: z.ZodOptional<z.ZodString>;
    tags: z.ZodDefault<z.ZodArray<z.ZodString>>;
    correlations: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
}, z.core.$strip>;
export type MoodLog = z.infer<typeof MoodLogSchema>;
export declare const LeaderboardEntrySchema: z.ZodObject<{
    id: z.ZodString;
    userId: z.ZodString;
    displayName: z.ZodString;
    xp: z.ZodNumber;
    level: z.ZodNumber;
    title: z.ZodString;
    titleEmoji: z.ZodString;
    badgeCount: z.ZodNumber;
    rank: z.ZodOptional<z.ZodNumber>;
    periodStart: z.ZodString;
    periodEnd: z.ZodString;
    lastUpdated: z.ZodString;
}, z.core.$strip>;
export type LeaderboardEntry = z.infer<typeof LeaderboardEntrySchema>;
export declare const GamificationExportSchema: z.ZodObject<{
    version: z.ZodDefault<z.ZodString>;
    exportedAt: z.ZodString;
    userId: z.ZodString;
    profile: z.ZodObject<{
        userId: z.ZodString;
        totalXP: z.ZodDefault<z.ZodNumber>;
        level: z.ZodDefault<z.ZodNumber>;
        currentTitle: z.ZodDefault<z.ZodString>;
        titleTier: z.ZodDefault<z.ZodNumber>;
        badgeCount: z.ZodDefault<z.ZodNumber>;
        challengesCompleted: z.ZodDefault<z.ZodNumber>;
        stats: z.ZodObject<{
            totalHabitsCreated: z.ZodDefault<z.ZodNumber>;
            totalCompletions: z.ZodDefault<z.ZodNumber>;
            longestStreak: z.ZodDefault<z.ZodNumber>;
            currentStreak: z.ZodDefault<z.ZodNumber>;
            domainsExplored: z.ZodDefault<z.ZodArray<z.ZodString>>;
            behaviorToolsUsed: z.ZodDefault<z.ZodArray<z.ZodString>>;
            comebacks: z.ZodDefault<z.ZodNumber>;
            weeklyReflections: z.ZodDefault<z.ZodNumber>;
        }, z.core.$strip>;
        preferences: z.ZodDefault<z.ZodObject<{
            showOnLeaderboard: z.ZodDefault<z.ZodBoolean>;
            displayName: z.ZodOptional<z.ZodString>;
            shareProgress: z.ZodDefault<z.ZodBoolean>;
        }, z.core.$strip>>;
        createdAt: z.ZodString;
        updatedAt: z.ZodString;
        lastActiveAt: z.ZodString;
    }, z.core.$strip>;
    badges: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        badgeId: z.ZodString;
        userId: z.ZodString;
        earnedAt: z.ZodString;
        rarity: z.ZodEnum<{
            rare: "rare";
            common: "common";
            uncommon: "uncommon";
            epic: "epic";
            legendary: "legendary";
        }>;
        category: z.ZodString;
        xpAwarded: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strip>>;
    challenges: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        challengeType: z.ZodString;
        userId: z.ZodString;
        status: z.ZodEnum<{
            active: "active";
            completed: "completed";
            abandoned: "abandoned";
        }>;
        startDate: z.ZodString;
        endDate: z.ZodOptional<z.ZodString>;
        currentDay: z.ZodNumber;
        totalDays: z.ZodDefault<z.ZodNumber>;
        completedDays: z.ZodArray<z.ZodNumber>;
        skippedDays: z.ZodDefault<z.ZodArray<z.ZodNumber>>;
        actions: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodAny>>;
        notes: z.ZodOptional<z.ZodString>;
        xpEarned: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strip>>;
    behaviorTools: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        toolType: z.ZodEnum<{
            accountability: "accountability";
            four_tendencies: "four_tendencies";
            identity_shift: "identity_shift";
            habit_break: "habit_break";
            environment_design: "environment_design";
            temptation_bundle: "temptation_bundle";
            setback_recovery: "setback_recovery";
            habit_audit: "habit_audit";
            circle_of_influence: "circle_of_influence";
        }>;
        userId: z.ZodString;
        createdAt: z.ZodString;
        updatedAt: z.ZodString;
        data: z.ZodRecord<z.ZodString, z.ZodAny>;
        status: z.ZodDefault<z.ZodEnum<{
            active: "active";
            completed: "completed";
            paused: "paused";
        }>>;
    }, z.core.$strip>>;
    moodLogs: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        userId: z.ZodString;
        date: z.ZodString;
        mood: z.ZodNumber;
        energy: z.ZodNumber;
        notes: z.ZodOptional<z.ZodString>;
        tags: z.ZodDefault<z.ZodArray<z.ZodString>>;
        correlations: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type GamificationExport = z.infer<typeof GamificationExportSchema>;
declare class MayaGamificationStore {
    private db;
    private initialized;
    private profileCache;
    private readonly CACHE_TTL;
    private readonly USERS_COLLECTION;
    private readonly GAMIFICATION_SUBCOLLECTION;
    private readonly LEADERBOARD_COLLECTION;
    /** Firestore batch write limit */
    private readonly FIRESTORE_BATCH_LIMIT;
    initialize(): Promise<void>;
    private ensureInitialized;
    /**
     * Get or create a user's gamification profile
     */
    getProfile(userId: string): Promise<GamificationProfile>;
    /**
     * Update a user's gamification profile
     */
    updateProfile(userId: string, updates: Partial<GamificationProfile>): Promise<GamificationProfile>;
    /**
     * Add XP to a user's profile
     */
    addXP(userId: string, amount: number, reason: string): Promise<{
        newTotal: number;
        leveledUp: boolean;
        newLevel: number;
    }>;
    /**
     * Award a badge to a user
     */
    awardBadge(userId: string, badge: Omit<EarnedBadge, 'id' | 'earnedAt'>): Promise<EarnedBadge>;
    /**
     * Get all badges for a user
     */
    getUserBadges(userId: string): Promise<EarnedBadge[]>;
    /**
     * Query badges by rarity
     */
    getBadgesByRarity(userId: string, rarity: EarnedBadge['rarity']): Promise<EarnedBadge[]>;
    /**
     * Check if user has a specific badge
     */
    hasBadge(userId: string, badgeId: string): Promise<boolean>;
    /**
     * Start a new challenge
     */
    startChallenge(userId: string, challenge: Omit<ChallengeProgress, 'id' | 'startDate' | 'status'>): Promise<ChallengeProgress>;
    /**
     * Update challenge progress
     */
    updateChallenge(userId: string, challengeId: string, updates: Partial<ChallengeProgress>): Promise<ChallengeProgress | null>;
    /**
     * Get active challenges for a user
     */
    getActiveChallenges(userId: string): Promise<ChallengeProgress[]>;
    /**
     * Get completed challenges for a user
     */
    getCompletedChallenges(userId: string): Promise<ChallengeProgress[]>;
    /**
     * Save behavior tool usage
     */
    saveBehaviorTool(userId: string, tool: Omit<BehaviorToolUsage, 'id' | 'createdAt' | 'updatedAt'>): Promise<BehaviorToolUsage>;
    /**
     * Get behavior tools by type
     */
    getBehaviorToolsByType(userId: string, toolType: BehaviorToolUsage['toolType']): Promise<BehaviorToolUsage[]>;
    /**
     * Log mood entry
     */
    logMood(userId: string, mood: Omit<MoodLog, 'id'>): Promise<MoodLog>;
    /**
     * Get mood logs for date range
     */
    getMoodLogs(userId: string, startDate: Date, endDate: Date): Promise<MoodLog[]>;
    /**
     * Update user's leaderboard entry
     */
    updateLeaderboardEntry(userId: string): Promise<void>;
    /**
     * Get leaderboard
     */
    getLeaderboard(period: 'weekly' | 'monthly' | 'all_time', limit?: number): Promise<LeaderboardEntry[]>;
    /**
     * Get user's rank on leaderboard
     */
    getUserRank(userId: string, period: 'weekly' | 'monthly' | 'all_time'): Promise<number | null>;
    /**
     * Set user's leaderboard preferences
     */
    setLeaderboardPreferences(userId: string, preferences: {
        showOnLeaderboard?: boolean;
        displayName?: string;
        shareProgress?: boolean;
    }): Promise<void>;
    /**
     * Export all gamification data for a user
     */
    exportUserData(userId: string): Promise<GamificationExport>;
    /**
     * Import gamification data for a user (restore from backup)
     */
    importUserData(userId: string, data: GamificationExport, options?: {
        overwrite?: boolean;
        mergeProfile?: boolean;
    }): Promise<{
        success: boolean;
        imported: {
            badges: number;
            challenges: number;
            behaviorTools: number;
            moodLogs: number;
        };
    }>;
    /**
     * Delete all gamification data for a user
     */
    deleteUserData(userId: string): Promise<boolean>;
    private createDefaultProfile;
    private cacheProfile;
    private calculateLevel;
    private getWeekStart;
    private getMonthStart;
    private getTitleEmoji;
}
export declare function getGamificationStore(): MayaGamificationStore;
export declare function initializeMayaGamificationStore(): Promise<MayaGamificationStore>;
export default MayaGamificationStore;
//# sourceMappingURL=gamification-store.d.ts.map