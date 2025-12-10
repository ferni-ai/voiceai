/**
 * Habit & Routine Coaching System
 *
 * A comprehensive life habits coach that uses behavior science principles
 * to help users build sustainable habits across all life domains.
 *
 * KEY CAPABILITIES:
 * - Multi-domain habit tracking (health, relationships, career, etc.)
 * - Glidepath progression (start tiny → build up)
 * - Life stage awareness (student, parent, retiree, etc.)
 * - Habit stacking & bundling
 * - Keystone habit identification
 * - Behavior science framework (cue-routine-reward)
 * - Personalized recommendations
 * - Accountability & encouragement
 *
 * Based on: Atomic Habits, Tiny Habits, The Power of Habit
 *
 * NOTE: All implementation is now in modular files under ./habit-coaching/
 * This file is a thin re-export layer for backward compatibility.
 *
 * @see ./habit-coaching/index.ts for the full module structure
 */

// ============================================================================
// RE-EXPORTS FROM MODULAR FILES
// ============================================================================

// Constants
export {
  LIFE_DOMAINS,
  LIFE_STAGES,
  FOUR_TENDENCIES_STRATEGIES,
  GLIDEPATH_LEVELS,
  SELF_COMPASSION_MESSAGES,
  ACCOUNTABILITY_TIPS,
  ENVIRONMENT_BUILD_STRATEGIES,
  ENVIRONMENT_BREAK_STRATEGIES,
} from './habit-coaching/constants.js';

// Data
export { THIRTY_DAY_CHALLENGES } from './habit-coaching/challenges.js';
export {
  HABIT_TEMPLATES,
  getTemplatesByDomain,
  getTemplatesByDifficulty,
  getKeystoneTemplates,
  getTemplateById,
  getTemplatesForStage,
} from './habit-coaching/templates.js';
export {
  HABIT_BUNDLES,
  getBundle,
  getBundleKeys,
  getBundleCoreHabits,
  getBundleEnhancements,
} from './habit-coaching/bundles.js';
export { LIFE_TRANSITION_SUPPORT } from './habit-coaching/transitions.js';

// Helpers
export {
  generateFrictionTips,
  detectSetbackPattern,
  diagnoseHabitFailure,
  getMotivationalContent,
  analyzeMoodPatterns,
  getMoodBasedTip,
  getChallengeDayEncouragement,
  checkChallengeMilestones,
} from './habit-coaching/helpers.js';

// Storage
export {
  getUserCoachData,
  saveUserCoachProfile,
  saveEnhancedHabit,
  saveHabitStack,
  saveWeeklyReflection,
  storedHabitToRuntime,
  runtimeHabitToStored,
  clearUserCache,
  clearAllCache,
  updateCachedData,
  type UserHabitCoachData,
} from './habit-coaching/storage.js';

// Tool creator
export { createHabitCoachingTools } from './habit-coaching/tools.js';

// ============================================================================
// TYPE RE-EXPORTS
// ============================================================================

export type {
  // Domain types
  LifeDomain,
  LifeStage,
  FourTendency,

  // Identity & breaking
  IdentityShift,
  HabitBreakPlan,

  // Environment & temptation
  EnvironmentDesign,
  TemptationBundle,

  // Tracking
  SetbackLog,
  AccountabilitySystem,
  MoodLog,

  // Challenges
  ThirtyDayChallenge,
  ChallengeWeek,
  ChallengeDefinition,

  // Bundles
  HabitBundleItem,
  HabitBundleDefinition,

  // Transitions
  LifeTransitionSupport,

  // Glidepath & behavior science
  GlidepathLevel,
  HabitLoop,
  HabitStack,
  KeystoneHabit,

  // Enhanced habits
  EnhancedHabit,
  HabitTemplate,
} from './habit-coaching/types.js';

// ============================================================================
// DEFAULT EXPORT
// ============================================================================

export { default } from './habit-coaching/tools.js';
