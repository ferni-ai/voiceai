/**
 * Habit Coaching Type Definitions
 *
 * All interfaces and types used by the habit coaching system.
 * Split from habit-coaching.ts for maintainability.
 */

// ============================================================================
// LIFE DOMAIN TYPES
// ============================================================================

export type LifeDomain =
  | 'health'
  | 'mind'
  | 'relationships'
  | 'career'
  | 'learning'
  | 'finance'
  | 'home'
  | 'selfCare';

export type LifeStage =
  | 'student'
  | 'early_career'
  | 'new_parent'
  | 'mid_career'
  | 'empty_nester'
  | 'pre_retirement'
  | 'retirement'
  | 'transition';

export type FourTendency = 'upholder' | 'questioner' | 'obliger' | 'rebel';

// ============================================================================
// IDENTITY & HABIT BREAKING
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

// ============================================================================
// ENVIRONMENT & TEMPTATION
// ============================================================================

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

// ============================================================================
// SETBACKS & ACCOUNTABILITY
// ============================================================================

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
// CHALLENGES
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
// HABIT BUNDLES
// ============================================================================

export interface HabitBundleDefinition {
  name: string;
  description: string;
  habits: Array<{
    name: string;
    frequency: string;
    duration: string;
  }>;
  synergies: string[];
  startTiny: string;
}

// ============================================================================
// MOOD & TRANSITIONS
// ============================================================================

export interface MoodLog {
  id: string;
  mood: number | string;
  energy: number;
  notes?: string;
  tags?: string[];
  timestamp: string;
  /** Time of day for pattern analysis */
  timeOfDay?: 'morning' | 'afternoon' | 'evening' | 'night';
  /** Habits completed on this day */
  habitsCompleted?: string[];
}

/**
 * Diagnosis of why a habit isn't working
 */
export interface HabitDiagnosis {
  issue: string;
  explanation: string;
  science?: string;
  fixes: string[];
  reframe: string;
  nextStep: string;
}

/**
 * Motivational content for coaching
 */
export interface MotivationalContent {
  message: string;
  source?: string;
  action: string;
  followUp: string;
}

/**
 * Mood pattern analysis results
 */
export interface MoodPatterns {
  insights: string[];
  habitCorrelations: Record<string, string>;
}

export interface LifeTransitionSupport {
  name: string;
  /** Empathetic acknowledgment of what the person is going through */
  validation: string;
  /** What to expect during this transition */
  expectations: string[];
  /** Core habits to maintain during transition */
  habitsToProtect: string[];
  /** Habits that can be paused temporarily */
  habitsToPause: string[];
  /** New habits to consider adding */
  habitsToAdd: string[];
  /** Order of priorities during transition */
  priorityOrder: string[];
  /** Expected time to adjust */
  adjustmentPeriod: string;
  /** Self-compassion note */
  selfCareNote: string;
}

// ============================================================================
// GLIDEPATH & BEHAVIOR SCIENCE
// ============================================================================

export interface GlidepathLevel {
  level: number;
  name: string;
  description: string;
  duration: string;
  criteria: string;
}

export interface HabitLoop {
  id: string;
  habit: string;
  cue: string;
  cueType: 'time' | 'location' | 'emotion' | 'preceding_action' | 'people';
  routine: string;
  reward: string;
  rewardType: 'intrinsic' | 'extrinsic';
  active: boolean;
}

/**
 * Rich habit loop structure for templates (blueprints).
 * More detailed than HabitLoop which is used for tracking.
 */
export interface HabitLoopTemplate {
  cue: {
    type: 'time' | 'location' | 'emotion' | 'preceding_action' | 'people';
    description: string;
    specificity: string;
  };
  routine: {
    behavior: string;
    duration: number;
    difficulty: 'tiny' | 'easy' | 'medium' | 'hard';
  };
  reward: {
    intrinsic: string;
    celebration: string;
  };
}

/**
 * Habit stack for behavior science (implementation intentions).
 * Use this when defining how habits chain together.
 */
export interface HabitStackDefinition {
  id: string;
  anchorHabit: string;
  newHabit: string;
  position: 'before' | 'after';
  implementation: string;
  active: boolean;
}

/**
 * Habit stack for storage and runtime use.
 * Represents a collection of habits stacked together.
 */
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
  habit: string;
  rippleEffects: string[];
  identityShift: string;
}

// ============================================================================
// ENHANCED HABITS
// ============================================================================

/**
 * Enhanced habit with full tracking and behavior science elements.
 * This matches the storage layer (EnhancedHabitData in productivity-store.ts).
 */
export interface EnhancedHabit {
  id: string;
  userId?: string;
  name: string;
  description?: string;
  domain: LifeDomain;
  subdomain?: string;

  // Glidepath progression
  currentLevel: number;
  targetLevel: number;
  levelStartDate: Date;
  levelHistory: Array<{ level: number; achievedAt: Date }>;

  // Habit loop (rich structure)
  habitLoop?: {
    cue: { type: string; description: string; specificity: string };
    routine: { behavior: string; duration: number; difficulty: string };
    reward: { intrinsic: string; extrinsic?: string; celebration: string };
  };

  // Stacking
  stackedOnto?: string;
  isAnchorFor?: string[];

  // Keystone
  isKeystone: boolean;
  keystoneScore?: number;
  cascadeEffects?: string[];

  // Tracking
  frequency: 'daily' | 'weekly' | 'monthly' | 'custom';
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

  // Meta
  createdAt: Date;
  updatedAt: Date;
  tags?: string[];
  notes?: string;
}

// ============================================================================
// HABIT TEMPLATES
// ============================================================================

export interface HabitTemplate {
  id: string;
  name: string;
  description: string;
  domain: LifeDomain;
  subdomain: string;
  defaultFrequency: 'daily' | 'weekly' | 'monthly';
  suggestedCue: string;
  suggestedReward: string;
  glidepathStart: string;
  glidepathEnd: string;
  keystonePotential: number;
  rippleEffects: string[];
  goodFor: LifeStage[];
}
