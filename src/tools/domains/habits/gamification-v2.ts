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
import { getLogger } from '../../../utils/safe-logger.js';
import { z } from 'zod';
import {
  getGamificationStore,
  type GamificationProfile,
  type EarnedBadge,
} from '../../../services/gamification-store.js';
import { BADGE_DEFINITIONS, TITLE_PROGRESSION } from '../../gamification.js';

import { getToolDescription } from '../../utils/tool-descriptions.js';
// ============================================================================
// GAMIFICATION TOOLS V2
// ============================================================================

export function createGamificationToolsV2() {
  const store = getGamificationStore();

  return {
    /**
     * Get user's complete gamification profile
     */
    getGamificationProfileV2: llm.tool({
      description: getToolDescription('getGamificationProfileV2'),
      parameters: z.object({}),
      execute: async (_, { ctx }) => {
        const userData = ctx.userData as { userId?: string };
        const userId = userData.userId || 'anonymous';

        const profile = await store.getProfile(userId);
        const title =
          TITLE_PROGRESSION.find((t) => t.id === profile.currentTitle) || TITLE_PROGRESSION[0];

        // Calculate XP progress
        const currentLevelXP = Math.pow(profile.level - 1, 2) * 100;
        const nextLevelXP = Math.pow(profile.level, 2) * 100;
        const progress = Math.round(
          ((profile.totalXP - currentLevelXP) / (nextLevelXP - currentLevelXP)) * 100
        );

        getLogger().info(
          { userId, level: profile.level, xp: profile.totalXP },
          '🎮 Profile retrieved'
        );

        return {
          profile: {
            level: profile.level,
            totalXP: profile.totalXP,
            xpToNextLevel: nextLevelXP - profile.totalXP,
            progress: `${progress}%`,
            title: `${title.emoji} ${title.name}`,
            titleTier: title.tier,
          },
          badges: {
            earned: profile.badgeCount,
            total: BADGE_DEFINITIONS.length,
          },
          stats: profile.stats,
          challenges: {
            completed: profile.challengesCompleted,
          },
          leaderboard: {
            showOnLeaderboard: profile.preferences.showOnLeaderboard,
            displayName: profile.preferences.displayName,
          },
        };
      },
    }),

    /**
     * Award XP with automatic level-up detection
     */
    awardXPV2: llm.tool({
      description: getToolDescription('awardXPV2'),
      parameters: z.object({
        amount: z.number().min(1).describe('Amount of XP to award'),
        reason: z.string().describe('Reason for the XP award'),
      }),
      execute: async ({ amount, reason }, { ctx }) => {
        const userData = ctx.userData as { userId?: string };
        const userId = userData.userId || 'anonymous';

        const result = await store.addXP(userId, amount, reason);

        // Update leaderboard
        await store.updateLeaderboardEntry(userId);

        getLogger().info({ userId, amount, reason, ...result }, '⭐ XP awarded');

        if (result.leveledUp) {
          const title =
            TITLE_PROGRESSION.find((t) => t.tier === result.newLevel) || TITLE_PROGRESSION[0];
          return {
            xpAwarded: amount,
            reason,
            newTotal: result.newTotal,
            levelUp: {
              newLevel: result.newLevel,
              message: `🎉 LEVEL UP! You're now Level ${result.newLevel}!`,
              newTitle: result.newLevel >= title.tier ? `${title.emoji} ${title.name}` : undefined,
            },
          };
        }

        return {
          xpAwarded: amount,
          reason,
          newTotal: result.newTotal,
          level: result.newLevel,
        };
      },
    }),

    /**
     * Award a badge to the user
     */
    awardBadgeV2: llm.tool({
      description: getToolDescription('awardBadgeV2'),
      parameters: z.object({
        badgeId: z.string().describe('The badge ID to award'),
      }),
      execute: async ({ badgeId }, { ctx }) => {
        const userData = ctx.userData as { userId?: string };
        const userId = userData.userId || 'anonymous';

        // Check if badge exists
        const badgeDef = BADGE_DEFINITIONS.find((b) => b.id === badgeId);
        if (!badgeDef) {
          return { error: `Badge '${badgeId}' not found` };
        }

        // Check if already earned
        const alreadyEarned = await store.hasBadge(userId, badgeId);
        if (alreadyEarned) {
          return {
            alreadyEarned: true,
            badge: `${badgeDef.emoji} ${badgeDef.name}`,
          };
        }

        // Award the badge
        const earned = await store.awardBadge(userId, {
          badgeId,
          userId,
          rarity: badgeDef.rarity,
          category: badgeDef.category,
          xpAwarded:
            badgeDef.rarity === 'legendary'
              ? 150
              : badgeDef.rarity === 'epic'
                ? 100
                : badgeDef.rarity === 'rare'
                  ? 75
                  : badgeDef.rarity === 'uncommon'
                    ? 60
                    : 50,
        });

        getLogger().info({ userId, badgeId, rarity: badgeDef.rarity }, '🏅 Badge awarded');

        return {
          awarded: true,
          badge: {
            name: badgeDef.name,
            emoji: badgeDef.emoji,
            description: badgeDef.description,
            rarity: badgeDef.rarity,
          },
          xpAwarded: earned.xpAwarded,
          message: `🎉 You earned the ${badgeDef.emoji} ${badgeDef.name} badge!`,
        };
      },
    }),

    /**
     * View badge collection with filtering
     */
    viewBadgeCollectionV2: llm.tool({
      description: getToolDescription('viewBadgeCollectionV2'),
      parameters: z.object({
        filter: z
          .enum(['all', 'earned', 'common', 'uncommon', 'rare', 'epic', 'legendary'])
          .optional()
          .describe('Filter badges'),
      }),
      execute: async ({ filter = 'all' }, { ctx }) => {
        const userData = ctx.userData as { userId?: string };
        const userId = userData.userId || 'anonymous';

        let earnedBadges: EarnedBadge[] = [];

        if (
          filter === 'common' ||
          filter === 'uncommon' ||
          filter === 'rare' ||
          filter === 'epic' ||
          filter === 'legendary'
        ) {
          earnedBadges = await store.getBadgesByRarity(userId, filter);
        } else {
          earnedBadges = await store.getUserBadges(userId);
        }

        const earnedIds = new Set(earnedBadges.map((b) => b.badgeId));

        const badges = BADGE_DEFINITIONS.map((def) => ({
          id: def.id,
          name: def.name,
          emoji: def.emoji,
          description: def.description,
          rarity: def.rarity,
          category: def.category,
          earned: earnedIds.has(def.id),
          earnedAt: earnedBadges.find((b) => b.badgeId === def.id)?.earnedAt,
        }));

        // Filter if needed
        let filteredBadges = badges;
        if (filter === 'earned') {
          filteredBadges = badges.filter((b) => b.earned);
        }

        // Group by rarity for summary
        const byRarity = {
          common: badges.filter((b) => b.earned && b.rarity === 'common').length,
          uncommon: badges.filter((b) => b.earned && b.rarity === 'uncommon').length,
          rare: badges.filter((b) => b.earned && b.rarity === 'rare').length,
          epic: badges.filter((b) => b.earned && b.rarity === 'epic').length,
          legendary: badges.filter((b) => b.earned && b.rarity === 'legendary').length,
        };

        getLogger().info(
          { userId, earned: earnedBadges.length, filter },
          '📜 Badge collection viewed'
        );

        return {
          badges: filteredBadges.slice(0, 20), // Limit for response size
          summary: {
            totalAvailable: BADGE_DEFINITIONS.length,
            totalEarned: earnedBadges.length,
            byRarity,
          },
        };
      },
    }),

    /**
     * Get leaderboard rankings
     */
    getLeaderboard: llm.tool({
      description: getToolDescription('getLeaderboard'),
      parameters: z.object({
        period: z
          .enum(['weekly', 'monthly', 'all_time'])
          .optional()
          .describe('Time period for leaderboard'),
        limit: z.number().min(1).max(50).optional().describe('Number of entries to return'),
      }),
      execute: async ({ period = 'weekly', limit = 10 }, { ctx }) => {
        const userData = ctx.userData as { userId?: string };
        const userId = userData.userId || 'anonymous';

        const leaderboard = await store.getLeaderboard(period, limit);
        const userRank = await store.getUserRank(userId, period);

        getLogger().info({ userId, period, userRank }, '📊 Leaderboard viewed');

        return {
          period,
          entries: leaderboard.map((entry) => ({
            rank: entry.rank,
            displayName: entry.displayName,
            title: `${entry.titleEmoji} ${entry.title}`,
            level: entry.level,
            xp: entry.xp,
            badges: entry.badgeCount,
          })),
          yourRank: userRank,
          message: userRank
            ? `You're ranked #${userRank} on the ${period.replace('_', ' ')} leaderboard!`
            : 'Keep building habits to appear on the leaderboard!',
        };
      },
    }),

    /**
     * Configure leaderboard privacy settings
     */
    setLeaderboardPrivacy: llm.tool({
      description: getToolDescription('setLeaderboardPrivacy'),
      parameters: z.object({
        showOnLeaderboard: z.boolean().optional().describe('Whether to appear on leaderboards'),
        displayName: z.string().optional().describe('Display name for leaderboard (for privacy)'),
        shareProgress: z.boolean().optional().describe('Whether to share progress publicly'),
      }),
      execute: async ({ showOnLeaderboard, displayName, shareProgress }, { ctx }) => {
        const userData = ctx.userData as { userId?: string };
        const userId = userData.userId || 'anonymous';

        await store.setLeaderboardPreferences(userId, {
          showOnLeaderboard,
          displayName,
          shareProgress,
        });

        const profile = await store.getProfile(userId);

        getLogger().info(
          { userId, showOnLeaderboard, displayName },
          '🔒 Leaderboard privacy updated'
        );

        return {
          updated: true,
          preferences: profile.preferences,
          message:
            showOnLeaderboard === false
              ? "You've been removed from leaderboards. Your progress is private."
              : displayName
                ? `Your display name is now "${displayName}"`
                : 'Leaderboard preferences updated!',
        };
      },
    }),

    /**
     * Export all gamification data (backup)
     */
    exportGamificationData: llm.tool({
      description: getToolDescription('exportGamificationData'),
      parameters: z.object({}),
      execute: async (_, { ctx }) => {
        const userData = ctx.userData as { userId?: string };
        const userId = userData.userId || 'anonymous';

        const exportData = await store.exportUserData(userId);

        getLogger().info(
          {
            userId,
            badges: exportData.badges.length,
            challenges: exportData.challenges.length,
          },
          '📤 Data exported'
        );

        return {
          exported: true,
          summary: {
            profile: `Level ${exportData.profile.level} - ${exportData.profile.totalXP} XP`,
            badges: exportData.badges.length,
            challenges: exportData.challenges.length,
            behaviorTools: exportData.behaviorTools.length,
            moodLogs: exportData.moodLogs.length,
          },
          data: exportData,
          message: 'Your gamification data has been exported. Save this for backup!',
        };
      },
    }),

    /**
     * Import gamification data (restore from backup)
     */
    importGamificationData: llm.tool({
      description: getToolDescription('importGamificationData'),
      parameters: z.object({
        data: z.any().describe('The exported gamification data to import'),
        mergeMode: z
          .boolean()
          .optional()
          .describe('If true, merges with existing data. If false, overwrites.'),
      }),
      execute: async ({ data, mergeMode = true }, { ctx }) => {
        const userData = ctx.userData as { userId?: string };
        const userId = userData.userId || 'anonymous';

        const result = await store.importUserData(userId, data, {
          mergeProfile: mergeMode,
          overwrite: !mergeMode,
        });

        getLogger().info({ userId, result, mergeMode }, '📥 Data imported');

        return {
          success: result.success,
          imported: result.imported,
          message: result.success
            ? `Successfully imported: ${result.imported.badges} badges, ${result.imported.challenges} challenges, ${result.imported.behaviorTools} tools, ${result.imported.moodLogs} mood logs`
            : 'Import failed. Please check the data format.',
        };
      },
    }),

    /**
     * Celebrate overall progress
     */
    celebrateProgressV2: llm.tool({
      description: getToolDescription('celebrateProgressV2'),
      parameters: z.object({}),
      execute: async (_, { ctx }) => {
        const userData = ctx.userData as { userId?: string };
        const userId = userData.userId || 'anonymous';

        const profile = await store.getProfile(userId);
        const badges = await store.getUserBadges(userId);
        const challenges = await store.getCompletedChallenges(userId);
        const rank = await store.getUserRank(userId, 'all_time');

        const title =
          TITLE_PROGRESSION.find((t) => t.id === profile.currentTitle) || TITLE_PROGRESSION[0];

        // Find rarest badge
        const rarestBadge = badges
          .map((b) => ({ ...b, def: BADGE_DEFINITIONS.find((d) => d.id === b.badgeId) }))
          .filter((b) => b.def)
          .sort((a, b) => {
            const rarityOrder = { legendary: 5, epic: 4, rare: 3, uncommon: 2, common: 1 };
            return rarityOrder[b.def!.rarity] - rarityOrder[a.def!.rarity];
          })[0];

        // Build highlights
        const highlights: string[] = [];

        if (profile.stats.longestStreak >= 30) {
          highlights.push(
            `🔥 ${profile.stats.longestStreak}-day longest streak - that's dedication!`
          );
        }
        if (challenges.length >= 1) {
          highlights.push(`🏆 ${challenges.length} challenge(s) completed!`);
        }
        if (profile.stats.domainsExplored.length >= 3) {
          highlights.push(
            `🌈 Building habits across ${profile.stats.domainsExplored.length} life domains!`
          );
        }
        if (profile.stats.comebacks >= 1) {
          highlights.push(`💪 ${profile.stats.comebacks} comeback(s) - that's resilience!`);
        }
        if (rank && rank <= 100) {
          highlights.push(`🏅 Top ${rank} on the all-time leaderboard!`);
        }

        getLogger().info({ userId, level: profile.level }, '🎊 Progress celebrated');

        return {
          title: `${title.emoji} ${title.name}`,
          level: profile.level,
          totalXP: profile.totalXP,
          badges: badges.length,
          rarestBadge: rarestBadge?.def
            ? `${rarestBadge.def.emoji} ${rarestBadge.def.name} (${rarestBadge.def.rarity})`
            : null,
          highlights,
          stats: {
            habitsCreated: profile.stats.totalHabitsCreated,
            completions: profile.stats.totalCompletions,
            longestStreak: profile.stats.longestStreak,
            challenges: challenges.length,
            domains: profile.stats.domainsExplored.length,
          },
          celebration: generateCelebration(profile),
        };
      },
    }),
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function generateCelebration(profile: GamificationProfile): string {
  const celebrations = [
    `Look at you - Level ${profile.level}! You've completed ${profile.stats.totalCompletions} habit check-ins!`,
    `From nothing to ${profile.stats.totalHabitsCreated} habits across ${profile.stats.domainsExplored.length} life domains. That's real growth!`,
    `Your ${profile.stats.longestStreak}-day streak shows what you're capable of. That's not luck - that's you showing up!`,
  ];

  if (profile.stats.comebacks > 0) {
    celebrations.push(
      `And you've made ${profile.stats.comebacks} comeback(s). That resilience is rare!`
    );
  }

  return celebrations[Math.floor(Math.random() * celebrations.length)];
}

// ============================================================================
// EXPORTS
// ============================================================================

export default createGamificationToolsV2;
