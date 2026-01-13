/**
 * Seasonal Mood Prediction
 *
 * > "November has historically been heavy for you.
 * > Last year you mentioned feeling isolated around this time.
 * > I'll check in more often this month."
 *
 * Tracks historical emotional patterns tied to:
 * - Seasons (winter, summer, etc.)
 * - Specific months
 * - Anniversaries (loss, breakup, etc.)
 * - Holidays
 * - Personal significant dates
 *
 * @module PredictiveInsights/SeasonalMood
 */
import type { SeasonalPeriod, HistoricalSeasonalPattern } from './types.js';
export interface SeasonalMoodPrediction {
    userId: string;
    /** Current/upcoming seasonal period */
    period: SeasonalPeriod;
    /** Start of the period */
    periodStart: Date;
    /** End of the period */
    periodEnd: Date;
    /** Historical pattern for this period */
    historicalPattern?: HistoricalSeasonalPattern;
    /** Predicted mood (0-100, lower = more difficult) */
    predictedMood: number;
    /** How significant is this pattern */
    severity: 'mild' | 'moderate' | 'significant';
    /** Human-friendly message */
    message: string;
    /** Suggestion */
    suggestion: string;
    /** Recommended support strategies */
    supportStrategies: string[];
    /** Confidence (0-1) */
    confidence: number;
    /** Should surface */
    shouldSurface: boolean;
}
/**
 * Predict seasonal mood patterns for a user
 */
export declare function predictSeasonalMood(userId: string): Promise<SeasonalMoodPrediction>;
/**
 * Record a mood observation
 */
export declare function recordMoodEntry(userId: string, score: number, themes?: string[], notes?: string): void;
/**
 * Add a significant date
 */
export declare function addSignificantDate(userId: string, date: string, // MM-DD format
type: 'anniversary' | 'loss' | 'birthday' | 'other', description: string, associatedMood?: number): void;
/**
 * Clear seasonal data for a user
 */
export declare function clearSeasonalData(userId: string): void;
declare const _default: {
    predictSeasonalMood: typeof predictSeasonalMood;
    recordMoodEntry: typeof recordMoodEntry;
    addSignificantDate: typeof addSignificantDate;
    clearSeasonalData: typeof clearSeasonalData;
};
export default _default;
//# sourceMappingURL=seasonal-mood.d.ts.map