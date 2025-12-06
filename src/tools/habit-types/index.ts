/**
 * Maya Habit Coach - Index
 *
 * This module provides Maya's comprehensive habit coaching system.
 * Split into focused files for maintainability:
 *
 * - domains.ts: Life domains and life stages
 * - tendencies.ts: Four Tendencies personality framework
 * - types.ts: Shared type definitions
 * - (Original file kept for tools function)
 *
 * Import from here for the main API, or from individual files for specific needs.
 */

// Re-export domain definitions
export {
  LIFE_DOMAINS,
  LIFE_STAGES,
  type LifeDomain,
  type LifeStage,
  getDomain,
  getStage,
  getAllDomains,
  getAllStages,
} from './domains.js';

// Re-export tendencies
export {
  FOUR_TENDENCIES_STRATEGIES,
  type FourTendency,
  getTendencyStrategies,
  getTendencyMotivation,
  getAllTendencies,
} from './tendencies.js';

// Re-export types
export type {
  IdentityShift,
  HabitBreakPlan,
  EnvironmentDesignStrategy,
  HabitTemplate,
  GlidepathLevel,
  ChallengeDay,
  ChallengeDefinition,
  HabitBundleDefinition,
  HabitTroubleshootGuide,
  LifeTransitionSupport,
  MotivationMessage,
  WeeklyReflectionPrompt,
  HabitCoachProfile,
} from './types.js';

// Re-export the main tools from the agent-agnostic file
export { createHabitCoachingTools } from '../habit-coaching.js';
