/**
 * Jordan Milestone Insights - Types
 *
 * Type definitions for Jordan's milestone planning context builder.
 *
 * @module intelligence/context-builders/jordan-milestone-insights/types
 */

// ============================================================================
// MAIN BRIEFING
// ============================================================================

export interface JordanInsightBriefing {
  /** Active goals overview */
  goalsOverview: GoalsOverview;
  /** Financial insights from Peter */
  peterInsights: PeterFinancialInsights;
  /** Habit momentum from Maya */
  mayaInsights: HabitInsights;
  /** Mood/energy patterns */
  moodPatterns: MoodInsights;
  /** Memory orchestrator insights */
  memoryInsights: MemoryInsights;
  /** Computed planning metrics */
  planningMetrics: PlanningMetrics;
  /** Celebration opportunities */
  celebrationOpportunities: string[];
  /** Timeline alerts */
  timelineAlerts: string[];
  /** Life stage context */
  lifeStageContext: LifeStageContext;
  /** Proactive discoveries */
  proactiveDiscoveries: string[];
  /** Seasonal awareness */
  seasonalContext: SeasonalContext;
  /** Better Than Human: Milestone calendar sync from Alex */
  milestoneCalendarSync: string | null;
  /** Cross-Persona: Jordan ↔ Alex coordination context */
  alexCoordinationContext: string | null;
}

// ============================================================================
// GOALS & FINANCES
// ============================================================================

export interface GoalsOverview {
  activeGoals: number;
  nearingCompletion: string[];
  atRisk: string[];
  recentlyAchieved: string[];
  totalSavedTowardGoals: number;
  biggestGoal: { name: string; progress: number; targetAmount: number } | null;
  milestoneDates: Array<{ name: string; date: Date; daysAway: number }>;
}

export interface PeterFinancialInsights {
  budgetHealth: 'excellent' | 'good' | 'tight' | 'stressed';
  savingsVelocity: string;
  monthsToGoalCompletion: number | null;
  eventBudgetCapacity: number;
  financialReadiness: string[];
}

// ============================================================================
// HABITS & MOOD
// ============================================================================

export interface HabitInsights {
  activeHabits: number;
  keystoneHabits: string[];
  currentStreaks: Array<{ name: string; streak: number }>;
  atRiskHabits: string[];
  averageSuccessRate: number;
  planningRelatedHabits: string[];
  momentumScore: number;
}

export interface MoodInsights {
  recentMoodTrend: 'improving' | 'declining' | 'stable' | 'unknown';
  averageEnergy: number;
  celebrationReadiness: 'high' | 'moderate' | 'low';
  lastMood: { mood: string; energy: string } | null;
}

// ============================================================================
// MEMORY & CONTEXT
// ============================================================================

export interface MemoryInsights {
  totalMemories: number;
  milestoneMentions: string[];
  upcomingAnniversaries: Array<{ event: string; date: Date; yearsAgo: number }>;
  pastCelebrations: string[];
  familyContext: string[];
  relationshipMilestones: string[];
}

export interface PlanningMetrics {
  /** Planning Velocity Index (0-100) - how efficiently goals progress */
  planningVelocityIndex: number;
  /** Celebration Readiness Score (0-100) - emotional + financial readiness */
  celebrationReadinessScore: number;
  /** Life Stage Momentum (0-100) - transition energy */
  lifeStageMomentum: number;
  /** Event Success Predictor (0-100) */
  eventSuccessPredictor: number;
  /** Key patterns detected */
  patterns: string[];
}

export interface LifeStageContext {
  currentStage: string;
  transitionSignals: string[];
  stageSpecificAdvice: string[];
  upcomingTransitions: string[];
}

export interface SeasonalContext {
  currentSeason: string;
  seasonalOpportunities: string[];
  upcomingDates: Array<{ name: string; date: string; daysAway: number }>;
  planningWindows: string[];
}

// ============================================================================
// HANDOFF
// ============================================================================

export interface HandoffBriefing {
  topic: string;
  planningContext: string | null;
  excitementLevel: 'low' | 'medium' | 'high';
  actionItems: string[];
  emotionalWeight: number;
  previousPersonaInsights: string[];
}

// ============================================================================
// DEFAULT VALUES
// ============================================================================

export const DEFAULT_GOALS_OVERVIEW: GoalsOverview = {
  activeGoals: 0,
  nearingCompletion: [],
  atRisk: [],
  recentlyAchieved: [],
  totalSavedTowardGoals: 0,
  biggestGoal: null,
  milestoneDates: [],
};

export const DEFAULT_PETER_INSIGHTS: PeterFinancialInsights = {
  budgetHealth: 'good',
  savingsVelocity: 'unknown',
  monthsToGoalCompletion: null,
  eventBudgetCapacity: 0,
  financialReadiness: [],
};

export const DEFAULT_HABIT_INSIGHTS: HabitInsights = {
  activeHabits: 0,
  keystoneHabits: [],
  currentStreaks: [],
  atRiskHabits: [],
  averageSuccessRate: 0,
  planningRelatedHabits: [],
  momentumScore: 0,
};

export const DEFAULT_MOOD_INSIGHTS: MoodInsights = {
  recentMoodTrend: 'unknown',
  averageEnergy: 5,
  celebrationReadiness: 'moderate',
  lastMood: null,
};

export const DEFAULT_MEMORY_INSIGHTS: MemoryInsights = {
  totalMemories: 0,
  milestoneMentions: [],
  upcomingAnniversaries: [],
  pastCelebrations: [],
  familyContext: [],
  relationshipMilestones: [],
};
