/**
 * Maya's Habit Coaching System - Module Index
 *
 * Re-exports all habit coaching types, data, and utilities.
 * The main tool functions remain in maya-habit-coach.ts.
 */

// Types
export type {
  LifeDomain,
  LifeStage,
  FourTendency,
  IdentityShift,
  HabitBreakPlan,
  EnvironmentDesign,
  TemptationBundle,
  SetbackLog,
  MoodLog,
  AccountabilitySystem,
  ThirtyDayChallenge,
  ChallengeDefinition,
  HabitBundleDefinition,
  LifeTransitionSupport,
  GlidepathLevel,
  HabitLoop,
  HabitStack,
  KeystoneHabit,
  EnhancedHabit,
  DomainDefinition,
  StageDefinition,
  TendencyStrategy,
} from './types.js';

// Life Domains & Stages
export {
  LIFE_DOMAINS,
  LIFE_STAGES,
  FOUR_TENDENCIES,
  GLIDEPATH_LEVELS,
} from './domains.js';

// 30-Day Challenges
export {
  THIRTY_DAY_CHALLENGES,
  getChallengeDayEncouragement,
  checkChallengeMilestones,
  getChallengeProgress,
} from './challenges.js';

// Habit Bundles
export {
  HABIT_BUNDLES,
  getBundleForGoal,
  formatBundleDescription,
} from './bundles.js';

