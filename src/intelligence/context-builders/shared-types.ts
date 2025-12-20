/**
 * Shared Types for Context Builders
 *
 * Common interfaces used across persona-specific context builders.
 * This prevents duplication and ensures consistency.
 *
 * @module intelligence/context-builders/shared-types
 */

// ============================================================================
// MOOD & ENERGY
// ============================================================================

export interface MoodInsights {
  /** Recent mood trends */
  recentTrend: 'improving' | 'declining' | 'stable' | 'unknown';
  /** Average energy level (0-10) */
  averageEnergy: number;
  /** Optimal time for coaching/deep work */
  optimalTime: string | null;
  /** Mood-habit correlations discovered */
  correlations: string[];
  /** Latest mood entry */
  latest: {
    mood: number;
    energy: number;
    timestamp: Date;
  } | null;
}

// ============================================================================
// MEMORY & CONTEXT
// ============================================================================

export interface MemoryInsights {
  /** Previous conversations mentioning relevant topics */
  relevantMemories: string[];
  /** Historical patterns detected */
  historicalPatterns: string[];
  /** Callbacks to reference */
  callbacks: string[];
  /** Anniversaries or significant dates */
  significantDates: string[];
}

// ============================================================================
// HABITS & PRODUCTIVITY
// ============================================================================

export interface HabitInsights {
  /** Active habit count */
  activeHabits: number;
  /** Current streaks */
  currentStreaks: Array<{ name: string; days: number; domain?: string }>;
  /** At-risk habits (streak endangered) */
  atRiskHabits: string[];
  /** Completion rate this week (0-100) */
  completionRate: number;
  /** Keystone habits identified */
  keystoneHabits: string[];
  /** Habit stacks */
  habitStacks: string[];
}

export interface HabitHealthSummary {
  /** Overall consistency (0-100) */
  consistencyIndex: number;
  /** Cascade potential - how habits reinforce each other */
  cascadePotential: number;
  /** Recovery speed after breaks */
  recoverySpeed: 'fast' | 'moderate' | 'slow' | 'unknown';
  /** Current momentum score */
  momentumScore: number;
  /** Keystone power - impact of key habits */
  keystonePower: number;
}

// ============================================================================
// PROACTIVE TRIGGERS
// ============================================================================

export type ProactiveTriggerType =
  | 'celebration'
  | 'support'
  | 'challenge'
  | 'insight'
  | 'connection'
  | 'follow_up'
  | 'check_in'
  | 'coordination'
  | 'reminder'
  | 'reflection'
  | 'reframe'
  | 'paradox'
  | 'question'
  | 'silence'
  | 'story';

export interface ProactiveTrigger {
  type: ProactiveTriggerType;
  reason: string;
  priority: 'high' | 'medium' | 'low';
  suggestedAction?: string;
  /** Source persona that detected this */
  sourcePersona?: string;
  /** When this was detected */
  detectedAt?: Date;
}

// ============================================================================
// HANDOFF CONTEXT
// ============================================================================

export interface HandoffBriefing {
  /** Source persona ID */
  fromPersona?: string;
  /** Topics discussed before handoff */
  topics: string[];
  /** Emotional state during handoff */
  emotionalState: string;
  /** Key context to carry forward */
  keyContext: string[];
  /** Pending items for target persona */
  pendingItems: string[];
}

// ============================================================================
// CROSS-TEAM DATA
// ============================================================================

export interface CrossTeamData {
  /** Peter's financial insights */
  financial?: {
    spendingTrend: 'up' | 'down' | 'stable';
    budgetHealth: number;
    recentAnomalies: string[];
  };
  /** Maya's habit insights */
  habits?: HabitInsights;
  /** Jordan's goal insights */
  goals?: {
    activeGoals: number;
    upcomingMilestones: string[];
    celebrationReady: string[];
  };
  /** Alex's calendar insights */
  calendar?: {
    density: 'light' | 'moderate' | 'heavy';
    focusTimeAvailable: boolean;
    upcomingDeadlines: string[];
  };
  /** Nayan's wisdom context */
  wisdom?: {
    currentLifeStage: string;
    activeThemes: string[];
    openQuestions: string[];
  };
}

// ============================================================================
// SUPERHUMAN CAPABILITIES (from services/superhuman)
// ============================================================================

export interface SuperhumanCapabilities {
  /** Commitment tracking */
  commitments: string;
  /** Predictive coaching */
  predictions: string;
  /** Life narrative */
  narrative: string;
  /** Values alignment */
  values: string;
  /** Crisis detection */
  crisis: string | null;
  /** Relationship network */
  network: string;
  /** Capacity/burnout guardian */
  capacity: string;
  /** Dream keeper */
  dreams: string;
  /** Relationship milestones */
  milestones: string;
  /** Seasonal awareness */
  seasonal: string;
}

// ============================================================================
// SESSION STATE
// ============================================================================

export interface PersonaSession {
  /** Turn count in current session */
  turnCount: number;
  /** First turn flag */
  isFirstTurn: boolean;
  /** Last injection timestamp */
  lastInjectionTime: number;
  /** Insights already surfaced this session */
  surfacedInsights: Set<string>;
  /** Proactive triggers detected */
  proactiveTriggers: ProactiveTrigger[];
}

// ============================================================================
// PERFORMANCE TRACKING
// ============================================================================

export interface BuilderPerformance {
  /** Builder name */
  name: string;
  /** Execution time in ms */
  durationMs: number;
  /** Number of injections produced */
  injectionCount: number;
  /** Whether it activated */
  activated: boolean;
  /** Timestamp */
  timestamp: number;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Create a default mood insights object
 */
export function createDefaultMoodInsights(): MoodInsights {
  return {
    recentTrend: 'unknown',
    averageEnergy: 5,
    optimalTime: null,
    correlations: [],
    latest: null,
  };
}

/**
 * Create a default habit insights object
 */
export function createDefaultHabitInsights(): HabitInsights {
  return {
    activeHabits: 0,
    currentStreaks: [],
    atRiskHabits: [],
    completionRate: 0,
    keystoneHabits: [],
    habitStacks: [],
  };
}

/**
 * Create a default memory insights object
 */
export function createDefaultMemoryInsights(): MemoryInsights {
  return {
    relevantMemories: [],
    historicalPatterns: [],
    callbacks: [],
    significantDates: [],
  };
}

/**
 * Create a default cross-team data object
 */
export function createDefaultCrossTeamData(): CrossTeamData {
  return {};
}

