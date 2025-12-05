/**
 * Maya's Habit & Routine Coaching - Type Definitions
 *
 * Extracted from maya-habit-coach.ts for cleaner architecture.
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
  | 'young_professional'
  | 'new_parent'
  | 'established_career'
  | 'caregiver'
  | 'pre_retirement'
  | 'retired'
  | 'life_transition';

export type FourTendency = 'upholder' | 'questioner' | 'obliger' | 'rebel';

// ============================================================================
// IDENTITY & BEHAVIOR INTERFACES
// ============================================================================

export interface IdentityShift {
  oldIdentity: string; // "I'm not a morning person"
  newIdentity: string; // "I'm someone who starts my day with intention"
  supportingBehaviors: string[]; // Evidence that builds new identity
  dailyAffirmation: string;
}

export interface HabitBreakPlan {
  habitToBreak: string;
  triggers: string[];
  replacementBehavior: string;
  copingStrategies: string[];
  relapseProtocol: string;
  supportSystem: string[];
  progressMarkers: Array<{
    day: number;
    milestone: string;
    reward: string;
  }>;
}

// ============================================================================
// ENVIRONMENT & TEMPTATION INTERFACES
// ============================================================================

export interface EnvironmentDesign {
  domain: LifeDomain;
  cueAdditions: Array<{
    trigger: string;
    placement: string;
    purpose: string;
  }>;
  frictionReductions: Array<{
    barrier: string;
    solution: string;
  }>;
  frictionAdditions: Array<{
    badHabit: string;
    friction: string;
  }>;
  environmentSnapshot?: string;
}

export interface TemptationBundle {
  temptation: string; // "Watching Netflix"
  habitToBundle: string; // "Stretching"
  bundleRule: string; // "I can watch Netflix while stretching"
  effectiveness?: number;
}

// ============================================================================
// TRACKING & LOGGING INTERFACES
// ============================================================================

export interface SetbackLog {
  date: string;
  habitAffected: string;
  trigger: string;
  emotionalState: string;
  circumstance: string;
  lessonsLearned: string;
  compassionateResponse: string;
  preventionStrategy: string;
  recoveryPlan: string;
}

export interface MoodLog {
  date: string;
  time: 'morning' | 'afternoon' | 'evening' | 'night';
  mood: 1 | 2 | 3 | 4 | 5;
  energy: 1 | 2 | 3 | 4 | 5;
  triggers?: string[];
  notes?: string;
}

// ============================================================================
// ACCOUNTABILITY & CHALLENGE INTERFACES
// ============================================================================

export interface AccountabilitySystem {
  type: 'buddy' | 'coach' | 'community' | 'self';
  frequency: 'daily' | 'weekly' | 'biweekly';
  checkInMethod: string;
  consequences?: {
    positive: string;
    negative: string;
  };
  streakTarget: number;
}

export interface ThirtyDayChallenge {
  name: string;
  description: string;
  domain: LifeDomain;
  difficulty: 'easy' | 'medium' | 'hard';
  dailyActions: string[];
  weeklyMilestones: string[];
  completionReward: string;
  currentDay?: number;
  completedDays?: number[];
  status?: 'active' | 'completed' | 'paused' | 'abandoned';
  startDate?: string;
}

export interface ChallengeDefinition {
  name: string;
  description: string;
  domain: LifeDomain;
  difficulty: 'easy' | 'medium' | 'hard';
  dailyActions: string[];
  weeklyMilestones: string[];
  completionReward: string;
}

// ============================================================================
// HABIT BUNDLE INTERFACES
// ============================================================================

export interface HabitBundleDefinition {
  name: string;
  description: string;
  domains: LifeDomain[];
  keystoneHabit: string;
  supportingHabits: string[];
  timeRequired: string;
  bestTimeOfDay: string;
  synergy: string;
}

// ============================================================================
// LIFE TRANSITION INTERFACES
// ============================================================================

export interface LifeTransitionSupport {
  name: string;
  description: string;
  duration: string;
  priorityDomains: LifeDomain[];
  keyHabits: string[];
  thingsToLet: string[];
  selfCareReminders: string[];
  resources?: string[];
}

// ============================================================================
// GLIDEPATH INTERFACES
// ============================================================================

export interface GlidepathLevel {
  level: number;
  name: string;
  description: string;
  durationWeeks: number;
  dailyCommitmentMinutes: number;
}

// ============================================================================
// HABIT STRUCTURE INTERFACES
// ============================================================================

export interface HabitLoop {
  cue: string;
  routine: string;
  reward: string;
  craving?: string; // What drives the loop
}

export interface HabitStack {
  id?: string;
  name: string;
  habits: Array<{
    order: number;
    habit: string;
    duration: string;
    transitionCue: string;
  }>;
  totalDuration: string;
  bestTime: string;
}

export interface KeystoneHabit {
  habit: string;
  domain: LifeDomain;
  rippleEffects: string[];
}

// ============================================================================
// ENHANCED HABIT INTERFACE
// ============================================================================

export interface EnhancedHabit {
  id?: string;
  name: string;
  domain: LifeDomain;
  subdomain?: string;

  // Behavior design
  cue: string;
  routine: string;
  reward: string;

  // Glidepath
  currentLevel: number;
  levelDetails: {
    tiny: string; // 2 min version
    small: string; // 5 min version
    standard: string; // 15 min version
    expanded: string; // 30 min version
  };

  // Tracking
  streakDays: number;
  totalCompletions: number;
  lastCompleted?: string;

  // Connection
  stackedWith?: string[];
  bundledWith?: string[];

  // Identity
  identityStatement: string;

  // Status
  status: 'building' | 'established' | 'automatic' | 'struggling' | 'paused';

  // Notes
  notes?: string;
}

// ============================================================================
// DOMAIN & STAGE DEFINITION INTERFACES
// ============================================================================

export interface DomainDefinition {
  name: string;
  icon: string;
  description: string;
  subdomains: string[];
}

export interface StageDefinition {
  name: string;
  description: string;
  priorities: LifeDomain[];
  constraints: string[];
  opportunities: string[];
  keyHabits: string[];
}

export interface TendencyStrategy {
  description: string;
  motivators: string[];
  strategies: string[];
  pitfalls: string[];
  habitApproach: string;
  accountabilityStyle: string;
}
