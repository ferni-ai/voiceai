/**
 * Jordan Milestone Insights - Types
 *
 * Type definitions for Jordan's milestone planning context builder.
 *
 * @module intelligence/context-builders/jordan-milestone-insights/types
 */
// ============================================================================
// DEFAULT VALUES
// ============================================================================
export const DEFAULT_GOALS_OVERVIEW = {
    activeGoals: 0,
    nearingCompletion: [],
    atRisk: [],
    recentlyAchieved: [],
    totalSavedTowardGoals: 0,
    biggestGoal: null,
    milestoneDates: [],
};
export const DEFAULT_PETER_INSIGHTS = {
    budgetHealth: 'good',
    savingsVelocity: 'unknown',
    monthsToGoalCompletion: null,
    eventBudgetCapacity: 0,
    financialReadiness: [],
};
export const DEFAULT_HABIT_INSIGHTS = {
    activeHabits: 0,
    keystoneHabits: [],
    currentStreaks: [],
    atRiskHabits: [],
    averageSuccessRate: 0,
    planningRelatedHabits: [],
    momentumScore: 0,
};
export const DEFAULT_MOOD_INSIGHTS = {
    recentMoodTrend: 'unknown',
    averageEnergy: 5,
    celebrationReadiness: 'moderate',
    lastMood: null,
};
export const DEFAULT_MEMORY_INSIGHTS = {
    totalMemories: 0,
    milestoneMentions: [],
    upcomingAnniversaries: [],
    pastCelebrations: [],
    familyContext: [],
    relationshipMilestones: [],
};
//# sourceMappingURL=types.js.map