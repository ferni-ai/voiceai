/**
 * Calendar Load Service
 *
 * Calculates calendar load metrics for integration with the Capacity Guardian.
 * This enables "better than human" burnout detection by combining:
 * - Energy readings (from conversation)
 * - Calendar load (meeting hours, back-to-back, focus time)
 *
 * No human assistant can track 4 weeks of calendar patterns and correlate
 * them with energy levels. Ferni can.
 *
 * @module calendar/calendar-load-service
 */
export interface CalendarLoadFactors {
    weeklyMeetingHours: number;
    weeklyFocusTimeRatio: number;
    weeklyBackToBackPercentage: number;
    todayMeetingHours: number;
    todayFocusTimeMinutes: number;
    consecutiveMeetingStreak: number;
    meetingHoursTrend: 'increasing' | 'stable' | 'decreasing';
    previousWeekHours: number;
    weekOverWeekChange: number;
    heaviestDayThisWeek: string | null;
    lightestDayThisWeek: string | null;
    upcomingHeavyDays: string[];
    consecutiveOverloadedDays: number;
    noRecoveryDays: number;
}
export interface CalendarBurnoutFactor {
    name: string;
    weight: number;
    description: string;
    riskContribution: number;
}
export interface HistoricalBurnoutPattern {
    period: string;
    weeklyMeetingHours: number;
    focusTimeRatio: number;
    backToBackPercentage: number;
}
/**
 * Calculate comprehensive calendar load factors for a user
 *
 * This is the main function used by Capacity Guardian to assess
 * calendar-based burnout risk.
 */
export declare function getCalendarLoadFactors(userId: string): Promise<CalendarLoadFactors>;
/**
 * Get calendar-based burnout risk factors
 *
 * Returns a list of factors that contribute to burnout risk,
 * each with a weight and risk contribution score.
 */
export declare function getCalendarBurnoutRiskFactors(userId: string): Promise<CalendarBurnoutFactor[]>;
/**
 * Cleanup Firestore connection
 *
 * Call this during graceful shutdown or test teardown to release
 * all Firestore resources and cancel pending operations.
 */
export declare function cleanupFirestore(): Promise<void>;
/**
 * Check if current calendar pattern matches a historical burnout pattern
 *
 * This is the "better than human" feature - we can detect when the user's
 * current calendar looks like it did before a previous burnout episode.
 */
export declare function matchHistoricalBurnoutPattern(userId: string, currentFactors?: CalendarLoadFactors): Promise<HistoricalBurnoutPattern | null>;
/**
 * Record a burnout period for future pattern matching
 *
 * Call this when user reports feeling burned out, or when
 * Ferni detects burnout signals (low energy + high calendar load).
 */
export declare function recordBurnoutPattern(userId: string, period?: string, customFactors?: Partial<HistoricalBurnoutPattern>): Promise<HistoricalBurnoutPattern | null>;
/**
 * Get all burnout patterns for a user (for analytics/debugging)
 */
export declare function getAllBurnoutPatterns(userId: string): Promise<HistoricalBurnoutPattern[]>;
/**
 * Delete a burnout pattern (if user believes it was incorrectly recorded)
 */
export declare function deleteBurnoutPattern(userId: string, docId: string): Promise<boolean>;
/**
 * Clear all burnout patterns for a user
 */
export declare function clearAllBurnoutPatterns(userId: string): Promise<number>;
/**
 * Get a summary of calendar load for context injection
 */
export declare function getCalendarLoadSummary(userId: string): Promise<string>;
export declare const calendarLoadService: {
    getLoadFactors: typeof getCalendarLoadFactors;
    getBurnoutFactors: typeof getCalendarBurnoutRiskFactors;
    matchHistoricalPattern: typeof matchHistoricalBurnoutPattern;
    recordBurnoutPattern: typeof recordBurnoutPattern;
    getAllPatterns: typeof getAllBurnoutPatterns;
    deletePattern: typeof deleteBurnoutPattern;
    clearPatterns: typeof clearAllBurnoutPatterns;
    getSummary: typeof getCalendarLoadSummary;
    cleanup: typeof cleanupFirestore;
};
export default calendarLoadService;
//# sourceMappingURL=calendar-load-service.d.ts.map