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
export { LIFE_DOMAINS, LIFE_STAGES, FOUR_TENDENCIES_STRATEGIES, GLIDEPATH_LEVELS, SELF_COMPASSION_MESSAGES, ACCOUNTABILITY_TIPS, ENVIRONMENT_BUILD_STRATEGIES, ENVIRONMENT_BREAK_STRATEGIES, } from './habit-coaching/constants.js';
export { THIRTY_DAY_CHALLENGES } from './habit-coaching/challenges.js';
export { HABIT_TEMPLATES, getTemplatesByDomain, getTemplatesByDifficulty, getKeystoneTemplates, getTemplateById, getTemplatesForStage, } from './habit-coaching/templates.js';
export { HABIT_BUNDLES, getBundle, getBundleKeys, getBundleCoreHabits, getBundleEnhancements, } from './habit-coaching/bundles.js';
export { LIFE_TRANSITION_SUPPORT } from './habit-coaching/transitions.js';
export { generateFrictionTips, detectSetbackPattern, diagnoseHabitFailure, getMotivationalContent, analyzeMoodPatterns, getMoodBasedTip, getChallengeDayEncouragement, checkChallengeMilestones, } from './habit-coaching/helpers.js';
export { getUserCoachData, saveUserCoachProfile, saveEnhancedHabit, saveHabitStack, saveWeeklyReflection, storedHabitToRuntime, runtimeHabitToStored, clearUserCache, clearAllCache, updateCachedData, type UserHabitCoachData, } from './habit-coaching/storage.js';
export { createHabitCoachingTools } from './habit-coaching/tools.js';
export type { LifeDomain, LifeStage, FourTendency, IdentityShift, HabitBreakPlan, EnvironmentDesign, TemptationBundle, SetbackLog, AccountabilitySystem, MoodLog, ThirtyDayChallenge, ChallengeWeek, ChallengeDefinition, HabitBundleItem, HabitBundleDefinition, LifeTransitionSupport, GlidepathLevel, HabitLoop, HabitStack, KeystoneHabit, EnhancedHabit, HabitTemplate, } from './habit-coaching/types.js';
export { default } from './habit-coaching/tools.js';
//# sourceMappingURL=habit-coaching.d.ts.map