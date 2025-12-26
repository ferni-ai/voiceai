/**
 * @deprecated MOVED TO: ./domains/habits/gamification-v2.ts and ./domains/habits/gamification-constants.ts
 *
 * This file has been moved to the habits domain. Update your imports:
 * ```
 * // OLD (deprecated)
 * import { createGamificationTools, BADGE_DEFINITIONS, TITLE_PROGRESSION } from '../gamification.js';
 *
 * // NEW
 * import { createGamificationToolsV2 } from '../domains/habits/gamification-v2.js';
 * import { BADGE_DEFINITIONS, TITLE_PROGRESSION } from '../domains/habits/gamification-constants.js';
 * ```
 *
 * This file re-exports from the new locations for backward compatibility.
 */

// Re-export constants from the new location
export {
  BADGE_DEFINITIONS,
  TITLE_PROGRESSION,
  type Badge,
  type BadgeCategory,
  type TitleLevel,
  type TitleTier,
} from './domains/habits/gamification-constants.js';

// Re-export the V2 tools as the default (under old name for compatibility)
export { createGamificationToolsV2 as createGamificationTools } from './domains/habits/gamification-v2.js';

// ============================================================================
// LEGACY FUNCTIONS FOR BACKWARD COMPATIBILITY
// ============================================================================

/**
 * @deprecated Use the gamification store directly for XP calculations
 *
 * Calculate level from total XP using the original formula.
 * Level curve: level = sqrt(totalXP / 100) + 1
 */
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

/**
 * @deprecated Use gamification-constants.ts instead
 */
export interface XPEvent {
  id: string;
  name: string;
  xp: number;
  description: string;
}

/**
 * @deprecated Use gamification-constants.ts instead
 */
export const XP_VALUES: XPEvent[] = [
  { id: 'habit_complete', name: 'Complete a habit', xp: 10, description: 'Daily habit completion' },
  { id: 'streak_3', name: '3-day streak', xp: 25, description: 'First streak milestone' },
  { id: 'streak_7', name: 'Week streak', xp: 50, description: 'Week of consistency' },
  { id: 'streak_21', name: '21-day habit', xp: 100, description: 'Habit formation milestone' },
  { id: 'streak_30', name: 'Month streak', xp: 150, description: 'Full month of consistency' },
  { id: 'streak_66', name: 'Automaticity', xp: 300, description: 'Habit is now automatic' },
  { id: 'streak_100', name: 'Century', xp: 500, description: '100 days of consistency' },
  { id: 'badge_earned', name: 'Earn a badge', xp: 50, description: 'Badge achievement' },
  { id: 'conversation', name: 'Have a conversation', xp: 5, description: 'Engaging with Ferni' },
  { id: 'journal_entry', name: 'Journal entry', xp: 15, description: 'Reflection and journaling' },
];

/**
 * @deprecated Use gamification-constants.ts instead
 */
export interface UserGamificationData {
  userId: string;
  totalXP: number;
  currentTitle: string;
  earnedBadges: Array<{ badgeId: string; earnedAt: string }>;
  badgeProgress: Record<string, number>;
  stats: {
    totalHabitsCreated: number;
    totalCompletions: number;
    longestStreak: number;
    currentStreak: number;
    conversationsThisWeek: number;
  };
}
