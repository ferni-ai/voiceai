/**
 * Gamification & Achievements System (V1)
 *
 * @deprecated This version uses in-memory storage and DOES NOT persist across sessions.
 * Use gamification-v2.ts instead which uses Firestore for proper persistence.
 *
 * Migration:
 *   // OLD (don't use)
 *   import { createGamificationTools } from './gamification.js';
 *
 *   // NEW (use this)
 *   import { createGamificationToolsV2 } from './gamification-v2.js';
 *
 * This file is kept only for:
 * - BADGE_DEFINITIONS and TITLE_PROGRESSION constants (shared with v2)
 * - Backwards compatibility during migration
 *
 * WILL BE REMOVED in a future version. Migrate to v2 now!
 */

import { llm, log } from '@livekit/agents';
import { getLogger } from '../utils/safe-logger.js';
import { z } from 'zod';
import { getProductivityStore } from '../services/productivity-store.js';

// ============================================================================
// BADGE SYSTEM
// ============================================================================

export interface Badge {
  id: string;
  name: string;
  emoji: string;
  description: string;
  category: BadgeCategory;
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
  earnedAt?: Date;
  progress?: number; // 0-100 for in-progress badges
  requirement: string;
}

export type BadgeCategory =
  | 'streaks' // Consistency badges
  | 'milestones' // Achievement milestones
  | 'challenges' // Challenge completion
  | 'domains' // Life domain mastery
  | 'behavior_science' // Using the frameworks
  | 'comebacks' // Resilience badges
  | 'social' // Accountability & connection
  | 'special'; // Rare/seasonal badges

export const BADGE_DEFINITIONS: Badge[] = [
  // =========== STREAK BADGES ===========
  {
    id: 'first_streak',
    name: 'Streak Starter',
    emoji: '🔥',
    description: 'Complete your first 3-day streak',
    category: 'streaks',
    rarity: 'common',
    requirement: '3-day streak on any habit',
  },
  {
    id: 'week_warrior',
    name: 'Week Warrior',
    emoji: '⚔️',
    description: 'Complete a 7-day streak',
    category: 'streaks',
    rarity: 'common',
    requirement: '7-day streak on any habit',
  },
  {
    id: 'fortnight_fighter',
    name: 'Fortnight Fighter',
    emoji: '🛡️',
    description: 'Complete a 14-day streak',
    category: 'streaks',
    rarity: 'uncommon',
    requirement: '14-day streak on any habit',
  },
  {
    id: 'habit_former',
    name: 'Habit Former',
    emoji: '🧠',
    description: 'Complete a 21-day streak (habits are forming!)',
    category: 'streaks',
    rarity: 'uncommon',
    requirement: '21-day streak on any habit',
  },
  {
    id: 'monthly_master',
    name: 'Monthly Master',
    emoji: '📅',
    description: 'Complete a 30-day streak',
    category: 'streaks',
    rarity: 'rare',
    requirement: '30-day streak on any habit',
  },
  {
    id: 'automaticity_achieved',
    name: 'Automaticity Achieved',
    emoji: '⚡',
    description: '66 days - the habit is now automatic',
    category: 'streaks',
    rarity: 'epic',
    requirement: '66-day streak (research-backed automaticity)',
  },
  {
    id: 'century_club',
    name: 'Century Club',
    emoji: '💯',
    description: '100 days of consistency',
    category: 'streaks',
    rarity: 'epic',
    requirement: '100-day streak on any habit',
  },
  {
    id: 'year_of_showing_up',
    name: 'Year of Showing Up',
    emoji: '🏅',
    description: '365 days. One full year.',
    category: 'streaks',
    rarity: 'legendary',
    requirement: '365-day streak on any habit',
  },

  // =========== MILESTONE BADGES ===========
  {
    id: 'first_habit',
    name: 'First Steps',
    emoji: '👣',
    description: 'Create your first habit',
    category: 'milestones',
    rarity: 'common',
    requirement: 'Create first habit',
  },
  {
    id: 'habit_collector',
    name: 'Habit Collector',
    emoji: '📚',
    description: 'Create 5 different habits',
    category: 'milestones',
    rarity: 'uncommon',
    requirement: '5 habits created',
  },
  {
    id: 'habit_architect',
    name: 'Habit Architect',
    emoji: '🏗️',
    description: 'Create 10 different habits',
    category: 'milestones',
    rarity: 'rare',
    requirement: '10 habits created',
  },
  {
    id: 'level_up',
    name: 'Level Up!',
    emoji: '📈',
    description: 'Advance a habit to Level 2',
    category: 'milestones',
    rarity: 'uncommon',
    requirement: 'Reach Level 2 on any habit',
  },
  {
    id: 'established',
    name: 'Established',
    emoji: '🌳',
    description: 'Advance a habit to Level 4',
    category: 'milestones',
    rarity: 'rare',
    requirement: 'Reach Level 4 on any habit',
  },
  {
    id: 'lifestyle_integration',
    name: 'Lifestyle Integration',
    emoji: '✨',
    description: 'Reach Level 5 - full mastery',
    category: 'milestones',
    rarity: 'epic',
    requirement: 'Reach Level 5 on any habit',
  },
  {
    id: 'completionist',
    name: 'Completionist',
    emoji: '🎯',
    description: 'Complete 100 habit check-ins',
    category: 'milestones',
    rarity: 'uncommon',
    requirement: '100 total habit completions',
  },
  {
    id: 'thousand_club',
    name: 'Thousand Club',
    emoji: '🌟',
    description: 'Complete 1,000 habit check-ins',
    category: 'milestones',
    rarity: 'legendary',
    requirement: '1,000 total habit completions',
  },

  // =========== CHALLENGE BADGES ===========
  {
    id: 'challenger',
    name: 'Challenger',
    emoji: '🎪',
    description: 'Start your first 30-day challenge',
    category: 'challenges',
    rarity: 'common',
    requirement: 'Start a 30-day challenge',
  },
  {
    id: 'challenge_week_one',
    name: 'Week One Wonder',
    emoji: '🌱',
    description: 'Complete the first week of a challenge',
    category: 'challenges',
    rarity: 'common',
    requirement: 'Complete week 1 of any challenge',
  },
  {
    id: 'challenge_halfway',
    name: 'Halfway Hero',
    emoji: '⛰️',
    description: 'Reach day 15 of a challenge',
    category: 'challenges',
    rarity: 'uncommon',
    requirement: 'Reach halfway in any challenge',
  },
  {
    id: 'challenge_complete',
    name: 'Challenge Champion',
    emoji: '🏆',
    description: 'Complete a full 30-day challenge',
    category: 'challenges',
    rarity: 'rare',
    requirement: 'Complete any 30-day challenge',
  },
  {
    id: 'challenge_master',
    name: 'Challenge Master',
    emoji: '👑',
    description: 'Complete 3 different challenges',
    category: 'challenges',
    rarity: 'epic',
    requirement: 'Complete 3 different 30-day challenges',
  },
  {
    id: 'transformation_complete',
    name: 'Total Transformation',
    emoji: '🦋',
    description: 'Complete 5 different challenges',
    category: 'challenges',
    rarity: 'legendary',
    requirement: 'Complete 5 different 30-day challenges',
  },

  // =========== LIFE DOMAIN BADGES ===========
  {
    id: 'health_explorer',
    name: 'Health Explorer',
    emoji: '💪',
    description: 'Start a habit in the Health domain',
    category: 'domains',
    rarity: 'common',
    requirement: 'Create health domain habit',
  },
  {
    id: 'mind_explorer',
    name: 'Mind Explorer',
    emoji: '🧘',
    description: 'Start a habit in the Mind domain',
    category: 'domains',
    rarity: 'common',
    requirement: 'Create mind domain habit',
  },
  {
    id: 'relationship_builder',
    name: 'Relationship Builder',
    emoji: '❤️',
    description: 'Start a habit in the Relationships domain',
    category: 'domains',
    rarity: 'common',
    requirement: 'Create relationships domain habit',
  },
  {
    id: 'domain_dabbler',
    name: 'Domain Dabbler',
    emoji: '🎨',
    description: 'Have habits in 3 different life domains',
    category: 'domains',
    rarity: 'uncommon',
    requirement: 'Habits in 3 different domains',
  },
  {
    id: 'well_rounded',
    name: 'Well Rounded',
    emoji: '🌈',
    description: 'Have habits in 5 different life domains',
    category: 'domains',
    rarity: 'rare',
    requirement: 'Habits in 5 different domains',
  },
  {
    id: 'life_master',
    name: 'Life Master',
    emoji: '🌍',
    description: 'Have habits in all 8 life domains',
    category: 'domains',
    rarity: 'legendary',
    requirement: 'Habits in all 8 life domains',
  },

  // =========== BEHAVIOR SCIENCE BADGES ===========
  {
    id: 'tendency_aware',
    name: 'Know Thyself',
    emoji: '🎭',
    description: 'Discover your Four Tendencies type',
    category: 'behavior_science',
    rarity: 'uncommon',
    requirement: 'Complete Four Tendencies assessment',
  },
  {
    id: 'identity_shifter',
    name: 'Identity Shifter',
    emoji: '🦋',
    description: 'Create an identity shift',
    category: 'behavior_science',
    rarity: 'uncommon',
    requirement: 'Start an identity-based habit change',
  },
  {
    id: 'environment_architect',
    name: 'Environment Architect',
    emoji: '🏠',
    description: 'Design your environment for success',
    category: 'behavior_science',
    rarity: 'uncommon',
    requirement: 'Complete environment design',
  },
  {
    id: 'habit_stacker',
    name: 'Habit Stacker',
    emoji: '📚',
    description: 'Create your first habit stack',
    category: 'behavior_science',
    rarity: 'uncommon',
    requirement: 'Create a habit stack',
  },
  {
    id: 'temptation_tamer',
    name: 'Temptation Tamer',
    emoji: '🎁',
    description: 'Create a temptation bundle',
    category: 'behavior_science',
    rarity: 'uncommon',
    requirement: 'Create a temptation bundle',
  },
  {
    id: 'behavior_scientist',
    name: 'Behavior Scientist',
    emoji: '🔬',
    description: 'Use 5 different behavior science tools',
    category: 'behavior_science',
    rarity: 'rare',
    requirement: 'Use 5 behavior science tools',
  },
  {
    id: 'habit_hacker',
    name: 'Habit Hacker',
    emoji: '💻',
    description: 'Successfully break a bad habit',
    category: 'behavior_science',
    rarity: 'rare',
    requirement: 'Complete bad habit substitution',
  },

  // =========== COMEBACK BADGES ===========
  {
    id: 'the_return',
    name: 'The Return',
    emoji: '🔙',
    description: 'Come back after 7+ days away',
    category: 'comebacks',
    rarity: 'uncommon',
    requirement: 'Return after extended absence',
  },
  {
    id: 'streak_phoenix',
    name: 'Streak Phoenix',
    emoji: '🐦‍🔥',
    description: 'Rebuild a streak after breaking one',
    category: 'comebacks',
    rarity: 'uncommon',
    requirement: 'Rebuild a broken streak',
  },
  {
    id: 'never_give_up',
    name: 'Never Give Up',
    emoji: '💪',
    description: 'Restart a habit 3+ times',
    category: 'comebacks',
    rarity: 'rare',
    requirement: 'Restart same habit multiple times',
  },
  {
    id: 'resilience_master',
    name: 'Resilience Master',
    emoji: '🛡️',
    description: 'Successfully recover from 5 setbacks',
    category: 'comebacks',
    rarity: 'epic',
    requirement: 'Recover from 5 different setbacks',
  },

  // =========== SOCIAL BADGES ===========
  {
    id: 'accountable',
    name: 'Accountable',
    emoji: '🤝',
    description: 'Set up an accountability system',
    category: 'social',
    rarity: 'uncommon',
    requirement: 'Create accountability system',
  },
  {
    id: 'reflector',
    name: 'Reflector',
    emoji: '📝',
    description: 'Complete your first weekly reflection',
    category: 'social',
    rarity: 'common',
    requirement: 'Complete weekly reflection',
  },
  {
    id: 'consistent_reflector',
    name: 'Consistent Reflector',
    emoji: '📖',
    description: 'Complete 4 weekly reflections in a row',
    category: 'social',
    rarity: 'rare',
    requirement: '4 consecutive weekly reflections',
  },

  // =========== SPECIAL BADGES ===========
  {
    id: 'early_bird',
    name: 'Early Bird',
    emoji: '🌅',
    description: 'Complete a habit before 6am',
    category: 'special',
    rarity: 'uncommon',
    requirement: 'Complete habit before 6am',
  },
  {
    id: 'night_owl',
    name: 'Night Owl',
    emoji: '🦉',
    description: 'Complete a habit after 11pm',
    category: 'special',
    rarity: 'uncommon',
    requirement: 'Complete habit after 11pm',
  },
  {
    id: 'weekend_warrior',
    name: 'Weekend Warrior',
    emoji: '🎉',
    description: 'Maintain habits on 4 consecutive weekends',
    category: 'special',
    rarity: 'rare',
    requirement: 'Habits on 4 weekends in a row',
  },
  {
    id: 'new_year_new_you',
    name: 'New Year, New You',
    emoji: '🎆',
    description: 'Start a habit in January',
    category: 'special',
    rarity: 'uncommon',
    requirement: 'Create habit in January',
  },
  {
    id: 'fresh_start',
    name: 'Fresh Start',
    emoji: '🌱',
    description: 'Start a habit on a Monday',
    category: 'special',
    rarity: 'common',
    requirement: 'Create habit on Monday',
  },
];

// ============================================================================
// TITLE SYSTEM - Evolving titles based on progress
// ============================================================================

export interface UserTitle {
  id: string;
  name: string;
  emoji: string;
  description: string;
  requirement: string;
  tier: number; // 1-10, higher = more prestigious
}

export const TITLE_PROGRESSION: UserTitle[] = [
  {
    id: 'newcomer',
    name: 'Newcomer',
    emoji: '🌱',
    description: 'Just starting the journey',
    requirement: 'Start using Maya',
    tier: 1,
  },
  {
    id: 'habit_seeker',
    name: 'Habit Seeker',
    emoji: '🔍',
    description: 'Exploring what habits to build',
    requirement: 'Create first habit',
    tier: 2,
  },
  {
    id: 'habit_starter',
    name: 'Habit Starter',
    emoji: '🚀',
    description: 'Beginning to build habits',
    requirement: '7-day streak on any habit',
    tier: 3,
  },
  {
    id: 'habit_builder',
    name: 'Habit Builder',
    emoji: '🏗️',
    description: 'Actively building new habits',
    requirement: '21-day streak or 3 habits',
    tier: 4,
  },
  {
    id: 'habit_practitioner',
    name: 'Habit Practitioner',
    emoji: '🎯',
    description: 'Practicing the art of habits',
    requirement: '30-day streak or habit at Level 3',
    tier: 5,
  },
  {
    id: 'habit_journeyman',
    name: 'Habit Journeyman',
    emoji: '🛤️',
    description: 'Well on the path',
    requirement: '66-day streak or 2 habits at Level 4',
    tier: 6,
  },
  {
    id: 'habit_expert',
    name: 'Habit Expert',
    emoji: '⭐',
    description: 'Deep understanding of habits',
    requirement: 'Complete a challenge + habit at Level 5',
    tier: 7,
  },
  {
    id: 'habit_master',
    name: 'Habit Master',
    emoji: '🏆',
    description: 'Mastered the art of habit building',
    requirement: '100-day streak + 3 challenges completed',
    tier: 8,
  },
  {
    id: 'habit_sage',
    name: 'Habit Sage',
    emoji: '🧙',
    description: 'Wise in the ways of behavior change',
    requirement: '365-day streak or 5 habits at Level 5',
    tier: 9,
  },
  {
    id: 'habit_legend',
    name: 'Habit Legend',
    emoji: '👑',
    description: 'A true legend of habit mastery',
    requirement: 'All domains covered + multiple year-long habits',
    tier: 10,
  },
];

// ============================================================================
// XP SYSTEM
// ============================================================================

export interface XPEvent {
  action: string;
  xp: number;
  description: string;
}

export const XP_VALUES: XPEvent[] = [
  { action: 'habit_completion', xp: 10, description: 'Complete a habit' },
  { action: 'streak_maintained', xp: 5, description: 'Maintain streak (daily bonus)' },
  { action: 'streak_milestone_7', xp: 50, description: '7-day streak milestone' },
  { action: 'streak_milestone_14', xp: 100, description: '14-day streak milestone' },
  { action: 'streak_milestone_21', xp: 150, description: '21-day streak milestone' },
  { action: 'streak_milestone_30', xp: 250, description: '30-day streak milestone' },
  { action: 'streak_milestone_66', xp: 500, description: '66-day streak milestone' },
  { action: 'streak_milestone_100', xp: 750, description: '100-day streak milestone' },
  { action: 'level_up', xp: 200, description: 'Level up a habit' },
  { action: 'challenge_day', xp: 15, description: 'Complete challenge day' },
  { action: 'challenge_week', xp: 100, description: 'Complete challenge week' },
  { action: 'challenge_complete', xp: 500, description: 'Complete full challenge' },
  { action: 'new_habit', xp: 25, description: 'Create new habit' },
  { action: 'habit_stack', xp: 50, description: 'Create habit stack' },
  { action: 'weekly_reflection', xp: 75, description: 'Complete weekly reflection' },
  { action: 'comeback', xp: 100, description: 'Return after absence' },
  { action: 'badge_earned', xp: 50, description: 'Earn a badge' },
  { action: 'behavior_science_tool', xp: 30, description: 'Use behavior science tool' },
];

export function calculateLevel(totalXP: number): {
  level: number;
  currentXP: number;
  xpToNext: number;
  progress: number;
} {
  // XP curve: level = sqrt(totalXP / 100)
  // Level 1 = 100 XP, Level 2 = 400 XP, Level 3 = 900 XP, etc.
  const level = Math.floor(Math.sqrt(totalXP / 100)) + 1;
  const xpForCurrentLevel = Math.pow(level - 1, 2) * 100;
  const xpForNextLevel = Math.pow(level, 2) * 100;
  const currentXP = totalXP - xpForCurrentLevel;
  const xpToNext = xpForNextLevel - totalXP;
  const progress = Math.round((currentXP / (xpForNextLevel - xpForCurrentLevel)) * 100);

  return { level, currentXP, xpToNext, progress };
}

// ============================================================================
// USER GAMIFICATION DATA
// ============================================================================

export interface UserGamificationData {
  userId: string;
  totalXP: number;
  currentTitle: string;
  earnedBadges: Array<{ badgeId: string; earnedAt: string }>;
  badgeProgress: Record<string, number>; // badgeId -> progress (0-100)
  stats: {
    totalHabitsCreated: number;
    totalCompletions: number;
    longestStreak: number;
    challengesCompleted: number;
    domainsExplored: string[];
    behaviorToolsUsed: string[];
    comebacks: number;
  };
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// GAMIFICATION TOOLS
// ============================================================================

export function createGamificationTools() {
  return {
    /**
     * Get user's gamification profile
     */
    getGamificationProfile: llm.tool({
      description: `Get the user's complete gamification profile including XP, level, title, and badges.
Use at the start of conversations to see their status, or when they ask about progress.`,
      parameters: z.object({}),
      execute: async (_, { ctx }) => {
        const userData = ctx.userData as { userId?: string };
        const userId = userData.userId || 'anonymous';

        const store = getProductivityStore();
        let gamificationData = store.getUserPreference(userId, 'gamification') as
          | UserGamificationData
          | undefined;

        // Initialize if not exists
        if (!gamificationData) {
          gamificationData = initializeGamificationData(userId);
          store.setUserPreference(userId, 'gamification', gamificationData);
        }

        const levelInfo = calculateLevel(gamificationData.totalXP);
        const title =
          TITLE_PROGRESSION.find((t) => t.id === gamificationData.currentTitle) ||
          TITLE_PROGRESSION[0];
        const earnedBadges = gamificationData.earnedBadges
          .map((eb) => BADGE_DEFINITIONS.find((b) => b.id === eb.badgeId))
          .filter(Boolean);

        getLogger().info(
          { userId, level: levelInfo.level, badges: earnedBadges.length },
          '🎮 Gamification profile retrieved'
        );

        return {
          level: levelInfo.level,
          xp: {
            total: gamificationData.totalXP,
            currentLevel: levelInfo.currentXP,
            toNextLevel: levelInfo.xpToNext,
            progress: `${levelInfo.progress}%`,
          },
          title: {
            current: title.name,
            emoji: title.emoji,
            tier: title.tier,
          },
          badges: {
            earned: earnedBadges.length,
            total: BADGE_DEFINITIONS.length,
            recent: earnedBadges.slice(-3).map((b) => `${b?.emoji} ${b?.name}`),
          },
          stats: gamificationData.stats,
          nextMilestone: getNextMilestone(gamificationData),
        };
      },
    }),

    /**
     * Award XP for an action
     */
    awardXP: llm.tool({
      description: `Award XP to the user for completing an action.
Use when user completes habits, challenges, or other achievements.`,
      parameters: z.object({
        action: z
          .enum([
            'habit_completion',
            'streak_maintained',
            'streak_milestone_7',
            'streak_milestone_14',
            'streak_milestone_21',
            'streak_milestone_30',
            'streak_milestone_66',
            'streak_milestone_100',
            'level_up',
            'challenge_day',
            'challenge_week',
            'challenge_complete',
            'new_habit',
            'habit_stack',
            'weekly_reflection',
            'comeback',
            'badge_earned',
            'behavior_science_tool',
          ])
          .describe('The action that earned XP'),
        multiplier: z.number().optional().describe('Optional multiplier for bonus XP'),
      }),
      execute: async ({ action, multiplier = 1 }, { ctx }) => {
        const userData = ctx.userData as { userId?: string };
        const userId = userData.userId || 'anonymous';

        const store = getProductivityStore();
        let gamificationData = store.getUserPreference(userId, 'gamification') as
          | UserGamificationData
          | undefined;

        if (!gamificationData) {
          gamificationData = initializeGamificationData(userId);
        }

        const xpEvent = XP_VALUES.find((e) => e.action === action);
        if (!xpEvent) {
          return { error: 'Unknown action' };
        }

        const xpAwarded = Math.round(xpEvent.xp * multiplier);
        const oldLevel = calculateLevel(gamificationData.totalXP).level;

        gamificationData.totalXP += xpAwarded;
        gamificationData.updatedAt = new Date().toISOString();

        const newLevelInfo = calculateLevel(gamificationData.totalXP);
        const leveledUp = newLevelInfo.level > oldLevel;

        // Check for title upgrade
        const newTitle = checkTitleUpgrade(gamificationData);
        if (newTitle && newTitle !== gamificationData.currentTitle) {
          gamificationData.currentTitle = newTitle;
        }

        store.setUserPreference(userId, 'gamification', gamificationData);

        getLogger().info({ userId, action, xp: xpAwarded, leveledUp }, '⭐ XP awarded');

        const result: Record<string, unknown> = {
          xpAwarded,
          reason: xpEvent.description,
          totalXP: gamificationData.totalXP,
          level: newLevelInfo.level,
          progress: `${newLevelInfo.progress}%`,
        };

        if (leveledUp) {
          result.levelUp = {
            newLevel: newLevelInfo.level,
            message: `🎉 LEVEL UP! You're now Level ${newLevelInfo.level}!`,
          };
        }

        if (newTitle && newTitle !== gamificationData.currentTitle) {
          const title = TITLE_PROGRESSION.find((t) => t.id === newTitle);
          result.titleUpgrade = {
            newTitle: title?.name,
            emoji: title?.emoji,
            message: `🏅 New Title: ${title?.emoji} ${title?.name}!`,
          };
        }

        return result;
      },
    }),

    /**
     * Check and award badges
     */
    checkBadges: llm.tool({
      description: `Check if user has earned any new badges based on their activity.
Call after significant actions to see if badges should be awarded.`,
      parameters: z.object({
        checkTypes: z
          .array(
            z.enum([
              'streaks',
              'milestones',
              'challenges',
              'domains',
              'behavior_science',
              'comebacks',
              'social',
              'special',
              'all',
            ])
          )
          .optional()
          .describe('Badge categories to check'),
      }),
      execute: async ({ checkTypes = ['all'] }, { ctx }) => {
        const userData = ctx.userData as { userId?: string };
        const userId = userData.userId || 'anonymous';

        const store = getProductivityStore();
        let gamificationData = store.getUserPreference(userId, 'gamification') as
          | UserGamificationData
          | undefined;

        if (!gamificationData) {
          gamificationData = initializeGamificationData(userId);
        }

        // Get user's habit data
        const habits = store.getUserEnhancedHabits(userId);
        const profile = store.getHabitCoachProfile(userId);
        const reflections = store.getUserWeeklyReflections(userId);

        const newBadges: Badge[] = [];
        const categoriesToCheck = checkTypes.includes('all')
          ? ([
              'streaks',
              'milestones',
              'challenges',
              'domains',
              'behavior_science',
              'comebacks',
              'social',
              'special',
            ] as BadgeCategory[])
          : (checkTypes as BadgeCategory[]);

        for (const category of categoriesToCheck) {
          const badgesToCheck = BADGE_DEFINITIONS.filter((b) => b.category === category);

          for (const badge of badgesToCheck) {
            // Skip if already earned
            if (gamificationData.earnedBadges.some((eb) => eb.badgeId === badge.id)) {
              continue;
            }

            // Check if earned
            const earned = checkBadgeRequirement(
              badge,
              gamificationData,
              habits,
              profile,
              reflections
            );

            if (earned) {
              newBadges.push(badge);
              gamificationData.earnedBadges.push({
                badgeId: badge.id,
                earnedAt: new Date().toISOString(),
              });
              // Award XP for badge
              gamificationData.totalXP += 50;
            }
          }
        }

        if (newBadges.length > 0) {
          gamificationData.updatedAt = new Date().toISOString();
          store.setUserPreference(userId, 'gamification', gamificationData);
        }

        getLogger().info({ userId, newBadges: newBadges.length }, '🏅 Badge check complete');

        return {
          newBadges: newBadges.map((b) => ({
            name: b.name,
            emoji: b.emoji,
            description: b.description,
            rarity: b.rarity,
          })),
          totalBadges: gamificationData.earnedBadges.length,
          message:
            newBadges.length > 0
              ? `🎉 You earned ${newBadges.length} new badge(s)!`
              : 'No new badges yet. Keep going!',
        };
      },
    }),

    /**
     * View all badges and progress
     */
    viewBadgeCollection: llm.tool({
      description: `View all available badges and the user's progress toward each.
Use when user asks about badges or achievements.`,
      parameters: z.object({
        category: z
          .enum([
            'streaks',
            'milestones',
            'challenges',
            'domains',
            'behavior_science',
            'comebacks',
            'social',
            'special',
            'all',
            'earned',
            'in_progress',
          ])
          .optional()
          .describe('Filter badges by category'),
      }),
      execute: async ({ category = 'all' }, { ctx }) => {
        const userData = ctx.userData as { userId?: string };
        const userId = userData.userId || 'anonymous';

        const store = getProductivityStore();
        const gamificationData = store.getUserPreference(userId, 'gamification') as
          | UserGamificationData
          | undefined;

        if (!gamificationData) {
          return {
            earned: [],
            available: BADGE_DEFINITIONS.length,
            message: 'Start building habits to earn badges!',
          };
        }

        let badges = BADGE_DEFINITIONS;

        if (category === 'earned') {
          badges = badges.filter((b) =>
            gamificationData.earnedBadges.some((eb) => eb.badgeId === b.id)
          );
        } else if (category === 'in_progress') {
          badges = badges.filter(
            (b) =>
              !gamificationData.earnedBadges.some((eb) => eb.badgeId === b.id) &&
              (gamificationData.badgeProgress[b.id] || 0) > 0
          );
        } else if (category !== 'all') {
          badges = badges.filter((b) => b.category === category);
        }

        const badgeInfo = badges.map((b) => {
          const earned = gamificationData.earnedBadges.find((eb) => eb.badgeId === b.id);
          return {
            name: b.name,
            emoji: b.emoji,
            description: b.description,
            rarity: b.rarity,
            category: b.category,
            earned: !!earned,
            earnedAt: earned?.earnedAt,
            progress: gamificationData.badgeProgress[b.id] || 0,
          };
        });

        getLogger().info(
          { userId, category, count: badgeInfo.length },
          '📜 Badge collection viewed'
        );

        return {
          badges: badgeInfo,
          summary: {
            total: BADGE_DEFINITIONS.length,
            earned: gamificationData.earnedBadges.length,
            byRarity: {
              common: badgeInfo.filter((b) => b.earned && b.rarity === 'common').length,
              uncommon: badgeInfo.filter((b) => b.earned && b.rarity === 'uncommon').length,
              rare: badgeInfo.filter((b) => b.earned && b.rarity === 'rare').length,
              epic: badgeInfo.filter((b) => b.earned && b.rarity === 'epic').length,
              legendary: badgeInfo.filter((b) => b.earned && b.rarity === 'legendary').length,
            },
          },
        };
      },
    }),

    /**
     * Get leaderboard/progress celebration
     */
    celebrateProgress: llm.tool({
      description: `Generate a celebration of the user's overall progress.
Use for milestone moments or when user wants to see how far they've come.`,
      parameters: z.object({}),
      execute: async (_, { ctx }) => {
        const userData = ctx.userData as { userId?: string };
        const userId = userData.userId || 'anonymous';

        const store = getProductivityStore();
        const gamificationData = store.getUserPreference(userId, 'gamification') as
          | UserGamificationData
          | undefined;

        if (!gamificationData) {
          return {
            message: "You're just getting started! Every journey begins with a single step.",
            suggestion: 'Create your first habit to begin earning XP and badges!',
          };
        }

        const levelInfo = calculateLevel(gamificationData.totalXP);
        const title =
          TITLE_PROGRESSION.find((t) => t.id === gamificationData.currentTitle) ||
          TITLE_PROGRESSION[0];
        const { stats } = gamificationData;

        // Generate personalized celebration
        const highlights: string[] = [];

        if (stats.longestStreak >= 30) {
          highlights.push(
            `🔥 Your longest streak is ${stats.longestStreak} days - that's incredible!`
          );
        }
        if (stats.challengesCompleted >= 1) {
          highlights.push(`🏆 You've completed ${stats.challengesCompleted} challenge(s)!`);
        }
        if (stats.domainsExplored.length >= 3) {
          highlights.push(
            `🌈 You're building habits across ${stats.domainsExplored.length} life domains!`
          );
        }
        if (stats.comebacks >= 1) {
          highlights.push(`💪 You've made ${stats.comebacks} comeback(s) - that's resilience!`);
        }

        const rarestBadge = gamificationData.earnedBadges
          .map((eb) => BADGE_DEFINITIONS.find((b) => b.id === eb.badgeId))
          .filter(Boolean)
          .sort((a, b) => {
            const rarityOrder = { legendary: 5, epic: 4, rare: 3, uncommon: 2, common: 1 };
            return rarityOrder[b!.rarity] - rarityOrder[a!.rarity];
          })[0];

        getLogger().info({ userId, level: levelInfo.level }, '🎊 Progress celebrated');

        return {
          title: `${title.emoji} ${title.name}`,
          level: levelInfo.level,
          totalXP: gamificationData.totalXP,
          badges: gamificationData.earnedBadges.length,
          rarestBadge: rarestBadge
            ? `${rarestBadge.emoji} ${rarestBadge.name} (${rarestBadge.rarity})`
            : null,
          highlights,
          stats: {
            habitsCreated: stats.totalHabitsCreated,
            completions: stats.totalCompletions,
            longestStreak: stats.longestStreak,
            challenges: stats.challengesCompleted,
            domains: stats.domainsExplored.length,
          },
          celebration: generateProgressCelebration(levelInfo.level, stats),
        };
      },
    }),

    /**
     * Update stats after an action
     */
    updateStats: llm.tool({
      description: `Update gamification stats after user actions.
Call after habit completions, challenge progress, etc.`,
      parameters: z.object({
        statType: z
          .enum([
            'habit_created',
            'habit_completed',
            'streak_updated',
            'challenge_completed',
            'domain_explored',
            'behavior_tool_used',
            'comeback',
          ])
          .describe('Type of stat to update'),
        value: z
          .union([z.string(), z.number()])
          .optional()
          .describe('Value for the stat (domain name, streak length, etc.)'),
      }),
      execute: async ({ statType, value }, { ctx }) => {
        const userData = ctx.userData as { userId?: string };
        const userId = userData.userId || 'anonymous';

        const store = getProductivityStore();
        let gamificationData = store.getUserPreference(userId, 'gamification') as
          | UserGamificationData
          | undefined;

        if (!gamificationData) {
          gamificationData = initializeGamificationData(userId);
        }

        switch (statType) {
          case 'habit_created':
            gamificationData.stats.totalHabitsCreated++;
            break;
          case 'habit_completed':
            gamificationData.stats.totalCompletions++;
            break;
          case 'streak_updated':
            if (typeof value === 'number' && value > gamificationData.stats.longestStreak) {
              gamificationData.stats.longestStreak = value;
            }
            break;
          case 'challenge_completed':
            gamificationData.stats.challengesCompleted++;
            break;
          case 'domain_explored':
            if (
              typeof value === 'string' &&
              !gamificationData.stats.domainsExplored.includes(value)
            ) {
              gamificationData.stats.domainsExplored.push(value);
            }
            break;
          case 'behavior_tool_used':
            if (
              typeof value === 'string' &&
              !gamificationData.stats.behaviorToolsUsed.includes(value)
            ) {
              gamificationData.stats.behaviorToolsUsed.push(value);
            }
            break;
          case 'comeback':
            gamificationData.stats.comebacks++;
            break;
        }

        gamificationData.updatedAt = new Date().toISOString();
        store.setUserPreference(userId, 'gamification', gamificationData);

        getLogger().info({ userId, statType, value }, '📊 Stats updated');

        return {
          updated: statType,
          currentStats: gamificationData.stats,
        };
      },
    }),
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function initializeGamificationData(userId: string): UserGamificationData {
  return {
    userId,
    totalXP: 0,
    currentTitle: 'newcomer',
    earnedBadges: [],
    badgeProgress: {},
    stats: {
      totalHabitsCreated: 0,
      totalCompletions: 0,
      longestStreak: 0,
      challengesCompleted: 0,
      domainsExplored: [],
      behaviorToolsUsed: [],
      comebacks: 0,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function checkTitleUpgrade(data: UserGamificationData): string | null {
  const { stats } = data;
  const { level } = calculateLevel(data.totalXP);

  // Check from highest tier to lowest
  if (stats.longestStreak >= 365 && stats.domainsExplored.length >= 8) {
    return 'habit_legend';
  }
  if (
    stats.longestStreak >= 365 ||
    (stats.domainsExplored.length >= 5 && stats.challengesCompleted >= 5)
  ) {
    return 'habit_sage';
  }
  if (stats.longestStreak >= 100 && stats.challengesCompleted >= 3) {
    return 'habit_master';
  }
  if (stats.challengesCompleted >= 1 && level >= 5) {
    return 'habit_expert';
  }
  if (stats.longestStreak >= 66 || level >= 4) {
    return 'habit_journeyman';
  }
  if (stats.longestStreak >= 30 || level >= 3) {
    return 'habit_practitioner';
  }
  if (stats.longestStreak >= 21 || stats.totalHabitsCreated >= 3) {
    return 'habit_builder';
  }
  if (stats.longestStreak >= 7) {
    return 'habit_starter';
  }
  if (stats.totalHabitsCreated >= 1) {
    return 'habit_seeker';
  }

  return 'newcomer';
}

function checkBadgeRequirement(
  badge: Badge,
  data: UserGamificationData,
  habits: Array<{ currentStreak: number; currentLevel: number; domain: string }>,
  profile: { lifeStage?: string } | null,
  reflections: Array<{ date: string }>
): boolean {
  const { stats } = data;

  switch (badge.id) {
    // Streak badges
    case 'first_streak':
      return stats.longestStreak >= 3;
    case 'week_warrior':
      return stats.longestStreak >= 7;
    case 'fortnight_fighter':
      return stats.longestStreak >= 14;
    case 'habit_former':
      return stats.longestStreak >= 21;
    case 'monthly_master':
      return stats.longestStreak >= 30;
    case 'automaticity_achieved':
      return stats.longestStreak >= 66;
    case 'century_club':
      return stats.longestStreak >= 100;
    case 'year_of_showing_up':
      return stats.longestStreak >= 365;

    // Milestone badges
    case 'first_habit':
      return stats.totalHabitsCreated >= 1;
    case 'habit_collector':
      return stats.totalHabitsCreated >= 5;
    case 'habit_architect':
      return stats.totalHabitsCreated >= 10;
    case 'level_up':
      return habits.some((h) => h.currentLevel >= 2);
    case 'established':
      return habits.some((h) => h.currentLevel >= 4);
    case 'lifestyle_integration':
      return habits.some((h) => h.currentLevel >= 5);
    case 'completionist':
      return stats.totalCompletions >= 100;
    case 'thousand_club':
      return stats.totalCompletions >= 1000;

    // Challenge badges
    case 'challenger':
      return stats.challengesCompleted >= 0 && data.badgeProgress['challenger'] === 100;
    case 'challenge_complete':
      return stats.challengesCompleted >= 1;
    case 'challenge_master':
      return stats.challengesCompleted >= 3;
    case 'transformation_complete':
      return stats.challengesCompleted >= 5;

    // Domain badges
    case 'domain_dabbler':
      return stats.domainsExplored.length >= 3;
    case 'well_rounded':
      return stats.domainsExplored.length >= 5;
    case 'life_master':
      return stats.domainsExplored.length >= 8;

    // Behavior science badges
    case 'behavior_scientist':
      return stats.behaviorToolsUsed.length >= 5;

    // Comeback badges
    case 'the_return':
      return stats.comebacks >= 1;
    case 'never_give_up':
      return stats.comebacks >= 3;
    case 'resilience_master':
      return stats.comebacks >= 5;

    // Social badges
    case 'reflector':
      return reflections.length >= 1;
    case 'consistent_reflector':
      return reflections.length >= 4;

    default:
      return false;
  }
}

function getNextMilestone(data: UserGamificationData): string {
  const { stats } = data;

  if (stats.totalHabitsCreated === 0) {
    return 'Create your first habit';
  }
  if (stats.longestStreak < 7) {
    return `${7 - stats.longestStreak} more days to your first week streak`;
  }
  if (stats.longestStreak < 21) {
    return `${21 - stats.longestStreak} more days to habit formation (21 days)`;
  }
  if (stats.longestStreak < 30) {
    return `${30 - stats.longestStreak} more days to Monthly Master badge`;
  }
  if (stats.longestStreak < 66) {
    return `${66 - stats.longestStreak} more days to Automaticity (66 days)`;
  }
  if (stats.challengesCompleted < 1) {
    return 'Complete your first 30-day challenge';
  }
  if (stats.domainsExplored.length < 5) {
    return `Explore ${5 - stats.domainsExplored.length} more life domains`;
  }

  return "Keep building! You're doing amazing!";
}

function generateProgressCelebration(level: number, stats: UserGamificationData['stats']): string {
  const celebrations = [
    `Look at you - Level ${level}! You've completed ${stats.totalCompletions} habit check-ins!`,
    `From nothing to ${stats.totalHabitsCreated} habits across ${stats.domainsExplored.length} life domains. That's real growth!`,
    `Your ${stats.longestStreak}-day streak shows what you're capable of. That's not luck - that's you showing up!`,
  ];

  if (stats.comebacks > 0) {
    celebrations.push(`And you've made ${stats.comebacks} comeback(s). That resilience is rare!`);
  }

  return celebrations[Math.floor(Math.random() * celebrations.length)];
}

// ============================================================================
// EXPORTS
// ============================================================================

// Legacy alias for backward compatibility
export const createMayaGamificationTools = createGamificationTools;

export default createGamificationTools;
