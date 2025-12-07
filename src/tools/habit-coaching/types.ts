/**
 * Type definitions for the Habit Coaching System
 *
 * @module habit-coaching/types
 */

import type { LifeDomain, LifeStage } from './constants.js';

// ============================================================================
// IDENTITY & BEHAVIOR TYPES
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

export interface EnvironmentDesign {
  id: string;
  habit: string;
  type: 'build' | 'break';
  currentSetup: string;
  changes: string[];
  implemented: string[];
  createdAt: string;
}

export interface TemptationBundle {
  id: string;
  needToDo: string;
  wantToDo: string;
  rule: string;
  createdAt: string;
  usageLog: Array<{ date: string; completed: boolean }>;
}

export interface SetbackLog {
  id: string;
  habit: string;
  trigger: string;
  feeling: string;
  lesson?: string;
  date: string;
}

export interface AccountabilitySystem {
  id: string;
  habit: string;
  type: 'partner' | 'group' | 'public' | 'coach' | 'app';
  partner?: string;
  schedule: string;
  consequences?: string;
  createdAt: string;
}

// ============================================================================
// CHALLENGE TYPES
// ============================================================================

export interface ThirtyDayChallenge {
  id: string;
  type: string;
  name: string;
  startDate: string;
  currentDay: number;
  intensity: 'gentle' | 'moderate' | 'intensive';
  completedDays: number[];
  missedDays: number[];
  notes: Record<number, { notes?: string; difficulty?: string; completed: boolean }>;
}

export interface ChallengeWeek {
  theme: string;
  days: string[];
  intensityNote: string;
}

export interface ChallengeDefinition {
  name: string;
  description: string;
  commitment: string;
  weeks: ChallengeWeek[];
}

// ============================================================================
// GLIDEPATH & PROGRESSION TYPES
// ============================================================================

export interface GlidepathLevel {
  level: number;
  name: string;
  description: string;
  duration: string;
  intensity: number;
  focus: string;
}

// ============================================================================
// HABIT SCIENCE FRAMEWORK TYPES
// ============================================================================

export interface HabitLoop {
  cue: {
    type: 'time' | 'location' | 'emotion' | 'preceding_action' | 'other_people';
    description: string;
    specificity: string;
  };
  routine: {
    behavior: string;
    duration: number;
    difficulty: 'tiny' | 'easy' | 'medium' | 'challenging';
  };
  reward: {
    intrinsic: string;
    extrinsic?: string;
    celebration: string;
  };
}

export interface HabitStack {
  id: string;
  name: string;
  description: string;
  anchorHabit: string;
  newHabits: string[];
  totalDuration: number;
  bestTimeOfDay: 'morning' | 'afternoon' | 'evening' | 'anytime';
}

export interface KeystoneHabit {
  habitId: string;
  cascadeEffects: string[];
  multiplierScore: number;
  evidence: string;
}

// ============================================================================
// ENHANCED HABIT TYPE
// ============================================================================

export interface EnhancedHabit {
  id: string;
  userId: string;
  name: string;
  description?: string;
  domain: LifeDomain;
  subdomain?: string;

  // Glidepath
  currentLevel: number;
  targetLevel: number;
  levelStartDate: Date;
  levelHistory: Array<{ level: number; achievedAt: Date }>;

  // Habit loop
  habitLoop: HabitLoop;

  // Stacking
  stackedOnto?: string;
  isAnchorFor?: string[];

  // Keystone analysis
  isKeystone: boolean;
  keystoneScore?: number;
  cascadeEffects?: string[];

  // Tracking
  frequency: 'daily' | 'weekdays' | 'weekends' | 'weekly' | 'custom';
  customDays?: number[];
  targetPerDay: number;
  currentStreak: number;
  longestStreak: number;
  totalCompletions: number;
  successRate: number;

  // Timing
  reminderTime?: string;
  bestPerformanceTime?: string;

  // Status
  isActive: boolean;
  isPaused: boolean;
  pauseReason?: string;

  // Metadata
  createdAt: Date;
  updatedAt: Date;
  tags: string[];
  notes?: string;
}

// ============================================================================
// HABIT TEMPLATE TYPE
// ============================================================================

export interface HabitTemplate {
  id: string;
  name: string;
  description: string;
  domain: LifeDomain;
  subdomain?: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  timeRequired: number;
  tinyVersion: string;
  fullVersion: string;
  habitLoop: HabitLoop;
  benefits: string[];
  isKeystone: boolean;
  cascadeEffects?: string[];
  bestForStages: LifeStage[];
  commonCues: string[];
  suggestedCelebrations: string[];
}

// ============================================================================
// USER DATA TYPES
// ============================================================================

export interface HabitCoachData {
  lifeStage: LifeStage;
  tendency: 'upholder' | 'questioner' | 'obliger' | 'rebel' | null;
  domainPriorities: LifeDomain[];
  enhancedHabits: EnhancedHabit[];
  habitStacks: HabitStack[];
  keystoneHabits: string[];
  activeChallenges: ThirtyDayChallenge[];
  identityShifts: IdentityShift[];
  habitBreakPlans: HabitBreakPlan[];
  environmentDesigns: EnvironmentDesign[];
  temptationBundles: TemptationBundle[];
  setbackLogs: SetbackLog[];
  accountabilitySystems: AccountabilitySystem[];
  weeklyReflections: WeeklyReflection[];
}

export interface WeeklyReflection {
  id: string;
  date: string;
  wins: string[];
  challenges: string[];
  insights: string[];
  adjustments: string[];
}

export interface MoodLog {
  id: string;
  date: string;
  mood: 'great' | 'good' | 'okay' | 'low' | 'struggling';
  energy: 'high' | 'moderate' | 'low' | 'depleted';
  timeOfDay: 'morning' | 'midday' | 'afternoon' | 'evening' | 'night';
  habitsCompleted: string[];
  notes?: string;
}

// ============================================================================
// LIFE TRANSITION TYPES
// ============================================================================

export interface LifeTransitionSupport {
  name: string;
  validation: string;
  expectations: string[];
  habitsToProtect: string[];
  habitsToPause: string[];
  habitsToAdd: string[];
  priorityOrder: string[];
  adjustmentPeriod: string;
  selfCareNote: string;
}

// ============================================================================
// MOTIVATION TYPES
// ============================================================================

export interface MotivationalContent {
  message: string;
  source?: string;
  action: string;
  followUp: string;
}

// ============================================================================
// HABIT BUNDLE TYPES
// ============================================================================

export interface HabitBundleHabit {
  name: string;
  minutes: number;
  tinyVersion: string;
  priority: 'core' | 'recommended' | 'optional';
  order: number;
}

export interface HabitBundle {
  id: string;
  name: string;
  goal: string;
  description: string;
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'anytime';
  totalMinutes: number;
  coreMinutes: number;
  habits: HabitBundleHabit[];
  stackFormula: string;
  science: string;
}

// ============================================================================
// DIAGNOSIS TYPES
// ============================================================================

export interface HabitDiagnosis {
  issue: string;
  explanation: string;
  science: string;
  fixes: string[];
  reframe: string;
  nextStep: string;
}

export interface MoodPatterns {
  insights: string[];
  habitCorrelations: Record<string, string>;
}

