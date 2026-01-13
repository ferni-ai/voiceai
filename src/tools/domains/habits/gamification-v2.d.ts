/**
 * Gamification Tools v2
 *
 * Uses Firestore subcollections for better querying, leaderboards,
 * and data management.
 *
 * NOTE: This is the agent-agnostic version. The original maya-gamification-v2.ts
 * re-exports from this file for backward compatibility.
 */
import { llm } from '@livekit/agents';
export declare function createGamificationToolsV2(): {
    /**
     * Get user's complete gamification profile
     */
    getGamificationProfileV2: llm.FunctionTool<Record<string, never>, unknown, {
        profile: {
            level: number;
            totalXP: number;
            xpToNextLevel: number;
            progress: string;
            title: string;
            titleTier: number;
        };
        badges: {
            earned: number;
            total: number;
        };
        stats: {
            totalHabitsCreated: number;
            totalCompletions: number;
            longestStreak: number;
            currentStreak: number;
            domainsExplored: string[];
            behaviorToolsUsed: string[];
            comebacks: number;
            weeklyReflections: number;
        };
        challenges: {
            completed: number;
        };
        leaderboard: {
            showOnLeaderboard: boolean;
            displayName: string | undefined;
        };
    }>;
    /**
     * Award XP with automatic level-up detection
     */
    awardXPV2: llm.FunctionTool<{
        amount: number;
        reason: string;
    }, unknown, {
        xpAwarded: number;
        reason: string;
        newTotal: number;
        levelUp: {
            newLevel: number;
            message: string;
            newTitle: string | undefined;
        };
        level?: undefined;
    } | {
        xpAwarded: number;
        reason: string;
        newTotal: number;
        level: number;
        levelUp?: undefined;
    }>;
    /**
     * Award a badge to the user
     */
    awardBadgeV2: llm.FunctionTool<{
        badgeId: string;
    }, unknown, {
        error: string;
        alreadyEarned?: undefined;
        badge?: undefined;
        awarded?: undefined;
        xpAwarded?: undefined;
        message?: undefined;
    } | {
        alreadyEarned: boolean;
        badge: string;
        error?: undefined;
        awarded?: undefined;
        xpAwarded?: undefined;
        message?: undefined;
    } | {
        awarded: boolean;
        badge: {
            name: string;
            emoji: string;
            description: string;
            rarity: "rare" | "common" | "uncommon" | "epic" | "legendary";
        };
        xpAwarded: number;
        message: string;
        error?: undefined;
        alreadyEarned?: undefined;
    }>;
    /**
     * View badge collection with filtering
     */
    viewBadgeCollectionV2: llm.FunctionTool<{
        filter?: "rare" | "all" | "earned" | "common" | "uncommon" | "epic" | "legendary" | undefined;
    }, unknown, {
        badges: {
            id: string;
            name: string;
            emoji: string;
            description: string;
            rarity: "rare" | "common" | "uncommon" | "epic" | "legendary";
            category: import("./gamification-constants.js").BadgeCategory;
            earned: boolean;
            earnedAt: string | undefined;
        }[];
        summary: {
            totalAvailable: number;
            totalEarned: number;
            byRarity: {
                common: number;
                uncommon: number;
                rare: number;
                epic: number;
                legendary: number;
            };
        };
    }>;
    /**
     * Get leaderboard rankings
     */
    getLeaderboard: llm.FunctionTool<{
        period?: "monthly" | "weekly" | "all_time" | undefined;
        limit?: number | undefined;
    }, unknown, {
        period: "monthly" | "weekly" | "all_time";
        entries: {
            rank: number | undefined;
            displayName: string;
            title: string;
            level: number;
            xp: number;
            badges: number;
        }[];
        yourRank: number | null;
        message: string;
    }>;
    /**
     * Configure leaderboard privacy settings
     */
    setLeaderboardPrivacy: llm.FunctionTool<{
        showOnLeaderboard?: boolean | undefined;
        displayName?: string | undefined;
        shareProgress?: boolean | undefined;
    }, unknown, {
        updated: boolean;
        preferences: {
            showOnLeaderboard: boolean;
            shareProgress: boolean;
            displayName?: string | undefined;
        };
        message: string;
    }>;
    /**
     * Export all gamification data (backup)
     */
    exportGamificationData: llm.FunctionTool<Record<string, never>, unknown, {
        exported: boolean;
        summary: {
            profile: string;
            badges: number;
            challenges: number;
            behaviorTools: number;
            moodLogs: number;
        };
        data: {
            version: string;
            exportedAt: string;
            userId: string;
            profile: {
                userId: string;
                totalXP: number;
                level: number;
                currentTitle: string;
                titleTier: number;
                badgeCount: number;
                challengesCompleted: number;
                stats: {
                    totalHabitsCreated: number;
                    totalCompletions: number;
                    longestStreak: number;
                    currentStreak: number;
                    domainsExplored: string[];
                    behaviorToolsUsed: string[];
                    comebacks: number;
                    weeklyReflections: number;
                };
                preferences: {
                    showOnLeaderboard: boolean;
                    shareProgress: boolean;
                    displayName?: string | undefined;
                };
                createdAt: string;
                updatedAt: string;
                lastActiveAt: string;
            };
            badges: {
                id: string;
                badgeId: string;
                userId: string;
                earnedAt: string;
                rarity: "rare" | "common" | "uncommon" | "epic" | "legendary";
                category: string;
                xpAwarded: number;
            }[];
            challenges: {
                id: string;
                challengeType: string;
                userId: string;
                status: "active" | "completed" | "abandoned";
                startDate: string;
                currentDay: number;
                totalDays: number;
                completedDays: number[];
                skippedDays: number[];
                actions: Record<string, any>;
                xpEarned: number;
                endDate?: string | undefined;
                notes?: string | undefined;
            }[];
            behaviorTools: {
                id: string;
                toolType: "accountability" | "four_tendencies" | "identity_shift" | "habit_break" | "environment_design" | "temptation_bundle" | "setback_recovery" | "habit_audit" | "circle_of_influence";
                userId: string;
                createdAt: string;
                updatedAt: string;
                data: Record<string, any>;
                status: "active" | "completed" | "paused";
            }[];
            moodLogs: {
                id: string;
                userId: string;
                date: string;
                mood: number;
                energy: number;
                tags: string[];
                notes?: string | undefined;
                correlations?: Record<string, any> | undefined;
            }[];
        };
        message: string;
    }>;
    /**
     * Import gamification data (restore from backup)
     */
    importGamificationData: llm.FunctionTool<{
        data: any;
        mergeMode?: boolean | undefined;
    }, unknown, {
        success: boolean;
        imported: {
            badges: number;
            challenges: number;
            behaviorTools: number;
            moodLogs: number;
        };
        message: string;
    }>;
    /**
     * Celebrate overall progress
     */
    celebrateProgressV2: llm.FunctionTool<Record<string, never>, unknown, {
        title: string;
        level: number;
        totalXP: number;
        badges: number;
        rarestBadge: string | null;
        highlights: string[];
        stats: {
            habitsCreated: number;
            completions: number;
            longestStreak: number;
            challenges: number;
            domains: number;
        };
        celebration: string;
    }>;
};
export default createGamificationToolsV2;
//# sourceMappingURL=gamification-v2.d.ts.map