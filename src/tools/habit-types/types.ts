/**
 * Maya Habit Coach - Shared Types
 *
 * Type definitions for habit coaching system.
 */

import type { LifeDomain } from './domains.js';
import type { FourTendency } from './tendencies.js';

// ============================================================================
// IDENTITY SHIFT TYPES
// ============================================================================

export interface IdentityShift {
  id: string;
  from: string;
  to: string;
  domain: LifeDomain;
  proofs: string[];
  createdAt: string;
  evidenceLog: Array<{ date: string; action: string }>;
}

// ============================================================================
// BAD HABIT BREAKING TYPES
// ============================================================================

export interface HabitBreakPlan {
  id: string;
  badHabit: string;
  cue: string;
  actualReward: string;
  replacement: string;
  frictionAdded: string[];
  startDate: string;
  relapseLog: Array<{ date: string; trigger: string }>;
  successStreak: number;
}

// ============================================================================
// ENVIRONMENT DESIGN
// ============================================================================

export interface EnvironmentDesignStrategy {
  category: 'make_obvious' | 'make_attractive' | 'make_easy' | 'make_satisfying';
  description: string;
  examples: string[];
}

// ============================================================================
// HABIT TEMPLATES
// ============================================================================

export interface HabitTemplate {
  id: string;
  name: string;
  domain: LifeDomain;
  category: string;
  description: string;
  tinyVersion: string;
  fullVersion: string;
  glidePath: string[];
  anchor: string;
  reward: string;
  keystoneEffect?: string;
}

// ============================================================================
// GLIDEPATH LEVELS
// ============================================================================

export interface GlidepathLevel {
  level: number;
  name: string;
  duration: string;
  description: string;
  focus: string;
  metrics: string[];
}

// ============================================================================
// THIRTY DAY CHALLENGES
// ============================================================================

export interface ChallengeDay {
  day: number;
  task: string;
  reflection?: string;
}

export interface ChallengeDefinition {
  id: string;
  name: string;
  domain: LifeDomain;
  description: string;
  days: ChallengeDay[];
  completionReward: string;
}

// ============================================================================
// HABIT BUNDLES
// ============================================================================

export interface HabitBundleDefinition {
  id: string;
  name: string;
  domains: LifeDomain[];
  description: string;
  habits: Array<{
    name: string;
    domain: LifeDomain;
    anchor: string;
    duration: string;
  }>;
  synergyEffect: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
}

// ============================================================================
// HABIT TROUBLESHOOTING
// ============================================================================

export interface HabitTroubleshootGuide {
  issue: string;
  description: string;
  questions: string[];
  solutions: Array<{
    condition: string;
    fix: string;
  }>;
}

// ============================================================================
// LIFE TRANSITION SUPPORT
// ============================================================================

export interface LifeTransitionSupport {
  id: string;
  name: string;
  description: string;
  commonChallenges: string[];
  habitAdjustments: Array<{
    domain: LifeDomain;
    suggestion: string;
  }>;
  selfCarePriorities: string[];
  timeline: string;
}

// ============================================================================
// MOTIVATION TYPES
// ============================================================================

export interface MotivationMessage {
  id: string;
  category: 'start' | 'struggle' | 'setback' | 'milestone' | 'maintain';
  tendency?: FourTendency;
  messages: string[];
}

// ============================================================================
// WEEKLY REFLECTION
// ============================================================================

export interface WeeklyReflectionPrompt {
  category: 'wins' | 'challenges' | 'insights' | 'adjustments';
  prompts: string[];
}

// ============================================================================
// COACH PROFILE
// ============================================================================

export interface HabitCoachProfile {
  userId: string;
  tendency?: FourTendency;
  lifeStage?: string;
  priorities: LifeDomain[];
  activeHabits: string[];
  completedChallenges: string[];
  identityShifts: IdentityShift[];
  habitBreakPlans: HabitBreakPlan[];
  createdAt: string;
  updatedAt: string;
}

