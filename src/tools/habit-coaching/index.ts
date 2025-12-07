/**
 * Habit Coaching Module
 *
 * Re-exports from modular files for cleaner imports.
 *
 * USAGE:
 *   // Direct imports (preferred for tree-shaking)
 *   import { LIFE_DOMAINS, LIFE_STAGES } from './habit-coaching/constants.js';
 *   import type { EnhancedHabit, HabitTemplate } from './habit-coaching/types.js';
 *
 *   // Or import from index
 *   import { LIFE_DOMAINS, type EnhancedHabit } from './habit-coaching/index.js';
 *
 * MIGRATION STATUS:
 *   - types.ts: Complete (all interfaces/types)
 *   - constants.ts: Complete (core constants, glidepath levels)
 *   - challenges.ts: Complete (30-day challenges)
 *   - templates.ts: Complete (habit templates)
 *   - bundles.ts: Complete (habit bundles)
 *   - transitions.ts: Complete (life transition support)
 *   - helpers.ts: Complete (utility functions)
 *   - storage.ts: Complete (persistence layer)
 *   - tendencies.ts: Complete (Four Tendencies)
 *   - tools.ts: TODO (createHabitCoachingTools - still in habit-coaching.ts)
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
// CHALLENGE EXPORTS
// ============================================================================

export { THIRTY_DAY_CHALLENGES } from './challenges.js';

// ============================================================================
// TEMPLATE EXPORTS
// ============================================================================

export {
  HABIT_TEMPLATES,
  getTemplatesByDomain,
  getTemplatesByDifficulty,
  getKeystoneTemplates,
  getTemplateById,
  getTemplatesForStage,
} from './templates.js';

// ============================================================================
// BUNDLE EXPORTS
// ============================================================================

export {
  HABIT_BUNDLES,
  getBundle,
  getBundleKeys,
  getBundleCoreHabits,
  getBundleEnhancements,
} from './bundles.js';

// ============================================================================
// TRANSITION EXPORTS
// ============================================================================

export { LIFE_TRANSITION_SUPPORT } from './transitions.js';

// ============================================================================
// TOOL CREATOR (still in monolithic file)
// ============================================================================

export { createHabitCoachingTools } from '../habit-coaching.js';
