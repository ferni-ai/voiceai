/**
 * Type definitions for Maya's coaching insights context builder.
 *
 * @module intelligence/context-builders/personas/maya-coaching-insights/types
 */

// ============================================================================
// MAIN BRIEFING STRUCTURE
// ============================================================================

export interface MayaInsightBriefing {
  /** Habit health overview */
  habitHealth: HabitHealthSummary;
  /** Computed coaching metrics */
  coachingMetrics: CoachingMetrics;
  /** Cross-domain correlations from Peter */
  peterInsights: string[];
  /** Goal-related coaching needs from Jordan */
  jordanInsights: string[];
  /** Mood/energy intelligence */
  moodIntelligence: MoodIntelligence;
  /** Proactive coaching triggers */
  proactiveTriggers: ProactiveTrigger[];
  /** User's tendency type if known */
  tendencyType: FourTendency | null;
  /** Recent wins to celebrate */
  winsToCelebrate: string[];
  /** Struggles needing gentle support */
  strugglesToAddress: string[];
  /** Memory insights from past conversations */
  memoryInsights: MemoryInsights;
  /** Better Than Human: Calendar-habit correlations from Alex */
  calendarInsights: string | null;
}

// ============================================================================
// HABIT HEALTH
// ============================================================================

export interface HabitHealthSummary {
  activeHabits: number;
  totalStreaks: number;
  averageSuccessRate: number;
  keystoneActive: boolean;
  keystoneHabits: string[];
  atRiskCount: number;
  recentSetbacks: string[];
  longestStreak: { name: string; days: number } | null;
  habitStacks: string[];
  weeklyReflectionSummary: string | null;
  totalCompletions: number;
  habitCategories: Record<string, number>;
}

// ============================================================================
// COACHING METRICS
// ============================================================================

export interface CoachingMetrics {
  /** Regularity of habit execution (0-100) */
  consistencyIndex: number;
  /** Likelihood habits ripple into other areas (0-100) */
  cascadePotential: number;
  /** How quickly they bounce back from setbacks (0-100) */
  recoverySpeed: number;
  /** Overall trend direction (0-100) */
  momentumScore: number;
  /** Impact of keystone habits (0-100) */
  keystonePower: number;
  /** Key patterns detected */
  patterns: string[];
}

// ============================================================================
// MOOD INTELLIGENCE
// ============================================================================

export interface MoodIntelligence {
  recentMoodTrend: 'improving' | 'declining' | 'stable' | 'unknown';
  averageEnergy: number;
  optimalCoachingTime: string | null;
  moodHabitCorrelations: string[];
  currentState: { mood: string; energy: string } | null;
  energyPatterns: string[];
}

// ============================================================================
// PROACTIVE TRIGGERS
// ============================================================================

export interface ProactiveTrigger {
  type: 'celebration' | 'support' | 'challenge' | 'insight' | 'connection';
  message: string;
  priority: 'high' | 'medium' | 'low';
  timing: 'immediate' | 'when_relevant' | 'next_session';
}

// ============================================================================
// FOUR TENDENCIES
// ============================================================================

export type FourTendency = 'upholder' | 'questioner' | 'obliger' | 'rebel';

// ============================================================================
// MEMORY INSIGHTS
// ============================================================================

export interface MemoryInsights {
  totalHabitConversations: number;
  previousWins: string[];
  previousStruggles: string[];
  coachingApproachesTried: string[];
  whatWorked: string[];
  whatDidntWork: string[];
}

// ============================================================================
// HANDOFF
// ============================================================================

export interface HandoffBriefing {
  topic: string;
  emotionalContext: string | null;
  actionItems: string[];
  fromPersona: string | null;
  urgency: 'low' | 'medium' | 'high';
}
