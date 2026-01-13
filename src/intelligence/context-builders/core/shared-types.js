/**
 * Shared Types for Context Builders
 *
 * Common interfaces used across persona-specific context builders.
 * This prevents duplication and ensures consistency.
 *
 * @module intelligence/context-builders/shared-types
 */
// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
/**
 * Create a default mood insights object
 */
export function createDefaultMoodInsights() {
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
export function createDefaultHabitInsights() {
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
export function createDefaultMemoryInsights() {
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
export function createDefaultCrossTeamData() {
    return {};
}
//# sourceMappingURL=shared-types.js.map