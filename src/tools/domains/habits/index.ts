/**
 * Habits Domain Tools
 *
 * Tools for habit tracking, coaching, and gamification.
 * This domain wraps existing tools in registry-compatible definitions.
 *
 * DOMAIN: habits
 * TOOLS:
 *   Core: addHabit, logHabit, getHabitStats, getDueHabits
 *   Coaching: assessLifeDomains, createHabitPlan, suggestKeystone, handleSetback
 *   Gamification: getGamificationProfile, awardBadge, getLeaderboard, celebrateStreak
 *
 * MIGRATION NOTE:
 *   New unified tools are available in ./unified-habits.ts
 *   These will eventually replace the legacy wrappers below.
 */

import { createDomainExport } from '../../registry/loader.js';
import type { ToolDefinition, ToolContext } from '../../registry/types.js';

// Import tool creators
import { createHabitTools } from '../../habits.js';
import { createHabitCoachingTools } from '../../habit-coaching.js';
// NOTE: Using gamification-v2 for proper Firestore persistence
import { createGamificationToolsV2 } from '../../gamification-v2.js';

// Also import new unified definitions (will be used in future)
import { habitToolDefinitions as unifiedHabitTools } from './unified-habits.js';

// ============================================================================
// LEGACY TOOL WRAPPER
// ============================================================================

function wrapLegacyTool(
  id: string,
  name: string,
  description: string,
  legacyTool: unknown,
  tags?: string[]
): ToolDefinition {
  return {
    id,
    name,
    description,
    domain: 'habits',
    tags: ['habits', ...(tags || [])],
    create: (_ctx: ToolContext) => legacyTool,
  };
}

// ============================================================================
// CORE HABIT TOOLS (Consolidated: 7 → 4 essential tools)
// ============================================================================

function getCoreHabitToolDefinitions(): ToolDefinition[] {
  const legacyTools = createHabitTools();

  // Consolidated: createHabit handles add/remove, logHabit tracks completion, getHabits combines list/due/stats
  return [
    wrapLegacyTool(
      'createHabit',
      'Create Habit',
      'Create a new habit to track, or remove an existing habit. Specify name, frequency (daily/weekly), category, and optional reminders.',
      legacyTools.addHabit,
      ['core', 'create', 'delete']
    ),
    wrapLegacyTool(
      'logHabitCompletion',
      'Log Habit Completion',
      'Log that you completed a habit for today. Tracks streaks and awards XP.',
      legacyTools.logHabit,
      ['core', 'tracking']
    ),
    wrapLegacyTool(
      'getHabits',
      'Get Habits',
      'Get habits due today, list all habits, or view stats for a specific habit. Include type: "due", "all", or "stats".',
      legacyTools.getDueHabits,
      ['core', 'list', 'stats', 'today']
    ),
    wrapLegacyTool(
      'habitCheckIn',
      'Habit Check-In',
      'Get a personalized check-in on your habit progress with encouragement and insights.',
      legacyTools.habitCheckIn,
      ['core', 'summary', 'checkin']
    ),
  ];
}

// ============================================================================
// COACHING TOOLS (Consolidated: 13 → 5 essential tools)
// ============================================================================

function getCoachingToolDefinitions(): ToolDefinition[] {
  const legacyTools = createHabitCoachingTools();

  // Consolidated: habitCoach handles recommendations/motivation/encouragement, setback for recovery,
  // habitStrategy for stacking/environment/troubleshooting
  return [
    wrapLegacyTool(
      'habitCoach',
      'Habit Coach',
      'Get personalized habit coaching: recommendations based on life stage, motivation, encouragement, or Four Tendencies assessment. Mode: "recommend", "motivate", "encourage", or "assess".',
      legacyTools.recommendHabits,
      ['coaching', 'recommendations', 'motivation']
    ),
    wrapLegacyTool(
      'habitSetback',
      'Habit Setback',
      'Get compassionate guidance for recovering from a habit setback. Includes identity work and self-compassion.',
      legacyTools.processSetback,
      ['coaching', 'setback', 'recovery']
    ),
    wrapLegacyTool(
      'habitStrategy',
      'Habit Strategy',
      'Get habit bundles and stacking strategies - pre-built combinations of habits that work well together for specific goals.',
      legacyTools.getHabitBundle,
      ['coaching', 'stacking', 'bundles', 'strategy']
    ),
  ];
}

// ============================================================================
// GAMIFICATION TOOLS (Consolidated: 6 → 2 essential tools)
// ============================================================================

function getGamificationToolDefinitions(): ToolDefinition[] {
  const legacyTools = createGamificationToolsV2();

  // Consolidated: gamificationProfile handles profile/badges/awards, leaderboard handles rankings
  return [
    wrapLegacyTool(
      'gamificationProfile',
      'Gamification Profile',
      'View gamification profile (level, XP, title), badge collection, or award XP/badges. Action: "profile", "badges", "award_xp", or "award_badge".',
      legacyTools.getGamificationProfileV2,
      ['gamification', 'profile', 'badges', 'rewards']
    ),
    wrapLegacyTool(
      'leaderboard',
      'Leaderboard',
      'View leaderboard rankings or configure privacy settings. Action: "view" or "settings".',
      legacyTools.getLeaderboard,
      ['gamification', 'leaderboard', 'social']
    ),
  ];
}

// ============================================================================
// DOMAIN TOOLS COLLECTION
// ============================================================================

const habitsTools: ToolDefinition[] = [
  ...getCoreHabitToolDefinitions(),
  ...getCoachingToolDefinitions(),
  ...getGamificationToolDefinitions(),
];

// ============================================================================
// EXPORTS
// ============================================================================

export const { getToolDefinitions, domain, definitions } = createDomainExport(
  'habits',
  habitsTools
);

export { getCoreHabitToolDefinitions, getCoachingToolDefinitions, getGamificationToolDefinitions };

// Export unified tools for future use
export { unifiedHabitTools };

// Re-export constants from unified
export {
  LIFE_DOMAINS,
  TENDENCY_STRATEGIES,
  type HabitFrequency,
  type HabitCategory,
  type FourTendency,
  type EnhancedHabit,
} from './unified-habits.js';

export default getToolDefinitions;
