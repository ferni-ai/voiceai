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

/**
 * Individual habit within a bundle
 */
export interface HabitBundleItem {
  name: string;
  /** Duration in minutes */
  minutes: number;
  /** Tiny version for glidepath level 1 */
  tinyVersion: string;
  /** Core habits are essential; enhancement habits are optional */
  priority: 'core' | 'enhancement';
  /** Order in the stack sequence */
  order: number;
}

/**
 * Pre-built habit bundle - curated habits that work well together.
 * Each bundle includes timing, science backing, and a stack formula.
 */
export interface HabitBundleDefinition {
  name: string;
  /** The outcome this bundle helps achieve */
  goal: string;
  description: string;
  /** Total minutes when all habits are performed */
  totalMinutes: number;
  /** Minutes for just the core habits */
  coreMinutes: number;
  /** The sequence formula, e.g., "After alarm → Water → Movement → Mindset" */
  stackFormula: string;
  /** Scientific backing for why this bundle works */
  science: string;
  /** Individual habits in this bundle */
  habits: HabitBundleItem[];
  /** How these habits reinforce each other */
  synergies: string[];
  /** How to start tiny with this bundle */
  startTiny: string;
}

// ============================================================================
// MOOD & TRANSITIONS
// ============================================================================

export interface MoodLog {
  id: string;
  mood: number | string;
  energy: number | string;
  notes?: string;
  tags?: string[];
  /** ISO timestamp */
  timestamp?: string;
  /** Legacy date field */
  date?: string;
  /** Time of day for pattern analysis */
  timeOfDay?: 'morning' | 'midday' | 'afternoon' | 'evening' | 'night';
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

/**
 * Glidepath level for gradual habit progression.
 * Based on "Tiny Habits" methodology - start small, build up.
 */
export interface GlidepathLevel {
  level: number;
  name: string;
  description: string;
  duration: string;
  /** Success criteria to advance to next level */
  criteria: string;
  /** Intensity percentage (0-100) for this level */
  intensity: number;
  /** What to focus on at this level */
  focus: string;
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
 * Based on "The Power of Habit" cue-routine-reward framework.
 * More detailed than HabitLoop which is used for runtime tracking.
 */
export interface HabitLoopTemplate {
  cue: {
    type: 'time' | 'location' | 'emotion' | 'preceding_action' | 'other_people';
    description: string;
    /** Implementation intention specificity, e.g., "After I pour my morning coffee" */
    specificity: string;
  };
  routine: {
    behavior: string;
    /** Duration in minutes */
    duration: number;
    difficulty: 'tiny' | 'easy' | 'medium' | 'challenging';
  };
  reward: {
    /** Internal satisfaction from the habit itself */
    intrinsic: string;
    /** Optional external reward */
    extrinsic?: string;
    /** Immediate celebration (per Tiny Habits methodology) */
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

/**
 * Complete habit template with behavior science backing.
 * Templates are blueprints for creating habits - they include
 * everything needed for AI coaching: glidepath versions, habit loops,
 * benefits, stacking suggestions, and life stage fit.
 */
export interface HabitTemplate {
  id: string;
  name: string;
  description: string;
  domain: LifeDomain;
  subdomain?: string;

  /** The goal this habit helps achieve */
  goal: string;
  /** Skill level required */
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  /** Time required in minutes at full level */
  timeRequired: number;
  /** Default frequency */
  defaultFrequency?: 'daily' | 'weekly' | 'monthly';

  // Glidepath versions for gradual progression
  /** Level 1: Tiny start (2 min or less) */
  tinyVersion: string;
  /** Level 2: Mini habit (5-10 min) */
  miniVersion: string;
  /** Level 5: Full lifestyle integration */
  fullVersion: string;

  // Behavior science
  /** The cue-routine-reward loop for this habit */
  habitLoop: HabitLoopTemplate;

  // Benefits & identity
  /** Direct benefits of this habit */
  benefits: string[];
  /** Ripple effects on other areas of life */
  cascadeEffects?: string[];
  /** Whether this is a keystone habit */
  isKeystone: boolean;
  /** Keystone potential score (0-100) */
  keystonePotential?: number;

  // Stacking suggestions
  /** Habits this pairs well with */
  stacksWellWith: string[];
  /** Existing habits to stack this after */
  stacksWellAfter: string[];

  // Life stage fit
  /** Life stages this habit is especially good for */
  goodFor: LifeStage[];

  // Evidence & coaching
  /** Scientific backing or source */
  scienceNote?: string;
  /** Suggested cue for implementation intention */
  suggestedCue?: string;
  /** Suggested reward */
  suggestedReward?: string;
}
