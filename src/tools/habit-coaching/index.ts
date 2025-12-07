/**
 * Habit Coaching Module
 *
 * Re-exports from modular files for cleaner imports.
 * This provides a migration path from the monolithic habit-coaching.ts.
 *
 * USAGE:
 *   // New modular imports (preferred)
 *   import { LIFE_DOMAINS, LIFE_STAGES } from './habit-coaching/constants.js';
 *   import type { EnhancedHabit, HabitTemplate } from './habit-coaching/types.js';
 *
 *   // Or import from index
 *   import { LIFE_DOMAINS, type EnhancedHabit } from './habit-coaching/index.js';
 *
 * MIGRATION STATUS:
 *   - types.ts: ✅ Complete (all interfaces/types extracted)
 *   - constants.ts: ✅ Complete (core constants extracted)
 *   - challenges.ts: 🔜 TODO (THIRTY_DAY_CHALLENGES - 600+ lines)
 *   - templates.ts: 🔜 TODO (HABIT_TEMPLATES - 300+ lines)
 *   - bundles.ts: 🔜 TODO (HABIT_BUNDLES - 500+ lines)
 *   - tools.ts: 🔜 TODO (createHabitCoachingTools - 1700+ lines)
 *
 * For now, the main habit-coaching.ts still exports everything.
 * These modules can be used for new code while migration continues.
 */

// ============================================================================
// TYPE EXPORTS
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
} from './types.js';

// ============================================================================
// CONSTANT EXPORTS
// ============================================================================

export {
  // Core data
  LIFE_DOMAINS,
  LIFE_STAGES,
  FOUR_TENDENCIES_STRATEGIES,
  GLIDEPATH_LEVELS,

  // Support messages
  SELF_COMPASSION_MESSAGES,
  ACCOUNTABILITY_TIPS,

  // Environment strategies
  ENVIRONMENT_BUILD_STRATEGIES,
  ENVIRONMENT_BREAK_STRATEGIES,
} from './constants.js';

// ============================================================================
// LEGACY RE-EXPORTS
// ============================================================================

/**
 * Re-export from original monolithic file for backward compatibility.
 *
 * TODO: Once migration is complete, these will be replaced with
 * exports from the modular files (challenges.ts, templates.ts, tools.ts).
 */
export {
  // Large constants (not yet migrated)
  THIRTY_DAY_CHALLENGES,
  HABIT_BUNDLES,
  LIFE_TRANSITION_SUPPORT,
  HABIT_TEMPLATES,

  // Tool creator (not yet migrated)
  createHabitCoachingTools,
} from '../habit-coaching.js';
