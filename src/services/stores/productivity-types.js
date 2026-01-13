/**
 * Productivity Data Types
 *
 * Type definitions for all productivity tools:
 * - Tasks, Bills, Routines, Notes, Habits
 * - Shopping, Medications, Packages, Travel
 * - Habit Coaching (Maya's enhanced system)
 */
/**
 * Create empty productivity data for a new user
 */
export function createEmptyProductivityData(userId) {
    return {
        userId,
        lastUpdated: new Date(),
        tasks: [],
        bills: [],
        billPayments: [],
        routines: [],
        routineCompletions: [],
        notes: [],
        journalEntries: [],
        habits: [],
        habitLogs: [],
        shoppingLists: [],
        medications: [],
        doseLogs: [],
        packages: [],
        savedTrips: [],
        flightSearches: [],
        hotelSearches: [],
        enhancedHabits: [],
        habitStacks: [],
        habitCoachProfile: null,
        weeklyReflections: [],
    };
}
//# sourceMappingURL=productivity-types.js.map