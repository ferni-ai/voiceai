/**
 * Habit & Routine Coaching System - Modular Components
 *
 * This module provides clean, modular access to the habit coaching system's
 * types, constants, and helper functions.
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
 * @module habit-coaching
 *
 * ## Usage
 *
 * For types and constants (new code should import from here):
 * ```typescript
 * import { LIFE_DOMAINS, LifeDomain, EnhancedHabit } from './tools/habit-coaching/index.js';
 * ```
 *
 * For the main tool creation function (maintained for backward compatibility):
 * ```typescript
 * import createHabitCoachingTools from './tools/habit-coaching.js';
 * ```
 */

// ============================================================================
// RE-EXPORTS FROM SUBMODULES
// ============================================================================

// Types
export type {
  IdentityShift,
  HabitBreakPlan,
  EnvironmentDesign,
  TemptationBundle,
  SetbackLog,
  AccountabilitySystem,
  ThirtyDayChallenge,
  ChallengeWeek,
  ChallengeDefinition,
  GlidepathLevel,
  HabitLoop,
  HabitStack,
  KeystoneHabit,
  EnhancedHabit,
  HabitTemplate,
  HabitCoachData,
  WeeklyReflection,
  MoodLog,
  LifeTransitionSupport,
  MotivationalContent,
  HabitBundleHabit,
  HabitBundle,
  HabitDiagnosis,
  MoodPatterns,
} from './types.js';

// Constants
export {
  LIFE_DOMAINS,
  LIFE_STAGES,
  GLIDEPATH_LEVELS,
  ENVIRONMENT_BUILD_STRATEGIES,
  ENVIRONMENT_BREAK_STRATEGIES,
  ACCOUNTABILITY_TIPS,
  SELF_COMPASSION_MESSAGES,
} from './constants.js';

export type { LifeDomain, LifeStage } from './constants.js';

// Four Tendencies
export {
  FOUR_TENDENCIES_STRATEGIES,
  getTendencyStrategies,
  getTendencyAvoid,
  getTendencyMotivation,
} from './tendencies.js';

export type { FourTendency } from './tendencies.js';

// Challenges
export {
  THIRTY_DAY_CHALLENGES,
  getChallenge,
  getChallengeTypes,
  getChallengeDay,
} from './challenges.js';

// Life Transitions
export {
  LIFE_TRANSITION_SUPPORT,
  getTransitionSupport,
  getTransitionTypes,
} from './transitions.js';

// Helper Functions
export {
  generateFrictionTips,
  detectSetbackPattern,
  diagnoseHabitFailure,
  getMotivationalContent,
  analyzeMoodPatterns,
  getEncouragement,
  getMoodBasedTip,
} from './helpers.js';

// ============================================================================
// NOTE ON MAIN TOOLS
// ============================================================================
// The main createHabitCoachingTools function and getUserCoachData are exported
// from the parent file: ../habit-coaching.js
//
// This is intentional to avoid circular dependencies and maintain backward
// compatibility. Future refactoring should migrate the tools to use these
// modular imports.
//
// For tools, import from:
// import createHabitCoachingTools, { getUserCoachData } from '../tools/habit-coaching.js';

