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
// CORE HABIT TOOLS
// ============================================================================

function getCoreHabitToolDefinitions(): ToolDefinition[] {
  const legacyTools = createHabitTools();

  return [
    wrapLegacyTool(
      'addHabit',
      'Add Habit',
      'Create a new habit to track with frequency and optional reminders',
      legacyTools.addHabit,
      ['core', 'create']
    ),
    wrapLegacyTool(
      'logHabit',
      'Log Habit',
      'Log completion of a habit for today',
      legacyTools.logHabit,
      ['core', 'tracking']
    ),
    wrapLegacyTool(
      'getDueHabits',
      'Get Due Habits',
      'Get habits that are due to be completed today',
      legacyTools.getDueHabits,
      ['core', 'list', 'today']
    ),
    wrapLegacyTool(
      'getHabitStats',
      'Get Habit Stats',
      'Get statistics for a habit including streak, completion rate, and history',
      legacyTools.getHabitStats,
      ['core', 'stats', 'analytics']
    ),
    wrapLegacyTool(
      'getAllHabits',
      'Get All Habits',
      'List all habits being tracked',
      legacyTools.getAllHabits,
      ['core', 'list']
    ),
    wrapLegacyTool(
      'removeHabit',
      'Remove Habit',
      'Stop tracking a habit',
      legacyTools.removeHabit,
      ['core', 'delete']
    ),
    wrapLegacyTool(
      'habitCheckIn',
      'Habit Check-In',
      'Get a summary of habit progress and encouragement',
      legacyTools.habitCheckIn,
      ['core', 'summary', 'checkin']
    ),
  ];
}

// ============================================================================
// COACHING TOOLS (from maya-habit-coach)
// ============================================================================

function getCoachingToolDefinitions(): ToolDefinition[] {
  const legacyTools = createHabitCoachingTools();

  return [
    wrapLegacyTool(
      'assessLifeDomains',
      'Assess Life Domains',
      'Assess satisfaction across life domains to identify areas for habit focus',
      legacyTools.assessLifeDomains,
      ['coaching', 'assessment']
    ),
    wrapLegacyTool(
      'setLifeStage',
      'Set Life Stage',
      'Set the user\'s current life stage to personalize habit recommendations',
      legacyTools.setLifeStage,
      ['coaching', 'context']
    ),
    wrapLegacyTool(
      'recommendHabits',
      'Recommend Habits',
      'Get personalized habit recommendations based on goals and life stage',
      legacyTools.recommendHabits,
      ['coaching', 'recommendations']
    ),
    wrapLegacyTool(
      'createEnhancedHabit',
      'Create Enhanced Habit',
      'Create a new habit with full coaching support and tracking',
      legacyTools.createEnhancedHabit,
      ['coaching', 'create']
    ),
    wrapLegacyTool(
      'createHabitStack',
      'Create Habit Stack',
      'Create a habit stack linking new habits to existing routines',
      legacyTools.createHabitStack,
      ['coaching', 'stacking']
    ),
    wrapLegacyTool(
      'designEnvironment',
      'Design Environment',
      'Get suggestions for environment changes to support habit formation',
      legacyTools.designEnvironment,
      ['coaching', 'environment']
    ),
    wrapLegacyTool(
      'processSetback',
      'Process Setback',
      'Get compassionate guidance for recovering from a habit setback',
      legacyTools.processSetback,
      ['coaching', 'setback', 'recovery']
    ),
    wrapLegacyTool(
      'getEncouragement',
      'Get Encouragement',
      'Get personalized encouragement and motivation',
      legacyTools.getEncouragement,
      ['coaching', 'motivation']
    ),
    wrapLegacyTool(
      'troubleshootHabit',
      'Troubleshoot Habit',
      'Analyze why a habit isn\'t sticking and get targeted advice',
      legacyTools.troubleshootHabit,
      ['coaching', 'diagnosis', 'troubleshooting']
    ),
    wrapLegacyTool(
      'getMotivation',
      'Get Motivation',
      'Get motivational wisdom and science-backed insights about habits',
      legacyTools.getMotivation,
      ['coaching', 'wisdom', 'motivation']
    ),
    wrapLegacyTool(
      'assessFourTendencies',
      'Assess Four Tendencies',
      'Determine user\'s tendency type for personalized accountability strategies',
      legacyTools.assessFourTendencies,
      ['coaching', 'personality']
    ),
    wrapLegacyTool(
      'createIdentityShift',
      'Create Identity Shift',
      'Help user shift identity to become the type of person who does the habit',
      legacyTools.createIdentityShift,
      ['coaching', 'identity']
    ),
    wrapLegacyTool(
      'breakBadHabit',
      'Break Bad Habit',
      'Get guidance on breaking an unwanted habit',
      legacyTools.breakBadHabit,
      ['coaching', 'breaking']
    ),
  ];
}

// ============================================================================
// GAMIFICATION TOOLS (from gamification-v2 - uses Firestore for persistence)
// ============================================================================

function getGamificationToolDefinitions(): ToolDefinition[] {
  const legacyTools = createGamificationToolsV2();

  return [
    wrapLegacyTool(
      'getGamificationProfile',
      'Get Gamification Profile',
      'Get user\'s gamification profile including level, XP, badges, and title',
      legacyTools.getGamificationProfileV2,
      ['gamification', 'profile']
    ),
    wrapLegacyTool(
      'awardXP',
      'Award XP',
      'Award experience points for habit-related actions',
      legacyTools.awardXPV2,
      ['gamification', 'xp', 'rewards']
    ),
    wrapLegacyTool(
      'awardBadge',
      'Award Badge',
      'Award a specific badge to the user',
      legacyTools.awardBadgeV2,
      ['gamification', 'badges', 'rewards']
    ),
    wrapLegacyTool(
      'viewBadgeCollection',
      'View Badge Collection',
      'View all earned badges and their details',
      legacyTools.viewBadgeCollectionV2,
      ['gamification', 'badges', 'collection']
    ),
    wrapLegacyTool(
      'getLeaderboard',
      'Get Leaderboard',
      'View the leaderboard rankings',
      legacyTools.getLeaderboard,
      ['gamification', 'leaderboard', 'social']
    ),
    wrapLegacyTool(
      'setLeaderboardPrivacy',
      'Set Leaderboard Privacy',
      'Configure leaderboard visibility and display name',
      legacyTools.setLeaderboardPrivacy,
      ['gamification', 'settings']
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

export {
  getCoreHabitToolDefinitions,
  getCoachingToolDefinitions,
  getGamificationToolDefinitions,
};

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

