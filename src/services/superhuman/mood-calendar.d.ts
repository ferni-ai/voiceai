/**
 * Mood Calendar - Better Than Human Pattern Recognition
 *
 * Predicts emotional states based on historical patterns:
 * - Day of week patterns ("You tend to feel anxious on Sundays")
 * - Time of day patterns ("Mornings are harder for you")
 * - Seasonal patterns ("Winter affects your mood")
 * - Event-based patterns ("After social events, you need recovery time")
 *
 * WHY IT'S SUPERHUMAN: No friend tracks 4 months of mood patterns
 * to predict your feelings with statistical confidence.
 *
 * @module services/superhuman/mood-calendar
 */
export type MoodType = 'joyful' | 'content' | 'calm' | 'neutral' | 'anxious' | 'sad' | 'frustrated' | 'overwhelmed' | 'exhausted' | 'hopeful';
export interface MoodEntry {
    userId: string;
    mood: MoodType;
    intensity: number;
    dayOfWeek: number;
    hourOfDay: number;
    month: number;
    dayOfMonth: number;
    timestamp: number;
    context?: string;
    triggers?: string[];
}
export interface MoodPattern {
    pattern: string;
    confidence: number;
    occurrences: number;
    description: string;
    recommendation?: string;
}
export interface MoodPrediction {
    dayOfWeek: number;
    hourOfDay: number;
    predictedMood: MoodType;
    confidence: number;
    historicalBasis: string;
    recommendation?: string;
}
export interface MoodCalendarSummary {
    /** Best times for the user emotionally */
    bestTimes: Array<{
        dayOfWeek: number;
        hourRange: string;
        avgMood: number;
    }>;
    /** Challenging times */
    challengingTimes: Array<{
        dayOfWeek: number;
        hourRange: string;
        avgMood: number;
        suggestion: string;
    }>;
    /** Detected patterns */
    patterns: MoodPattern[];
    /** Predictions for upcoming days */
    predictions: MoodPrediction[];
}
/**
 * Record a mood entry for pattern analysis.
 */
export declare function recordMoodEntry(userId: string, mood: MoodType, intensity: number, context?: string, triggers?: string[]): Promise<void>;
/**
 * Load mood entries for a user.
 */
export declare function loadMoodEntries(userId: string, daysBack?: number): Promise<MoodEntry[]>;
/**
 * Detect mood patterns from historical data.
 */
export declare function detectMoodPatterns(entries: MoodEntry[]): MoodPattern[];
/**
 * Predict mood for a specific time.
 */
export declare function predictMood(entries: MoodEntry[], targetDayOfWeek: number, targetHourOfDay: number): MoodPrediction | null;
/**
 * Get complete mood calendar summary.
 */
export declare function getMoodCalendarSummary(userId: string): Promise<MoodCalendarSummary>;
/**
 * Build context for LLM injection.
 */
export declare function buildMoodCalendarContext(userId: string): Promise<string>;
export declare const moodCalendar: {
    record: typeof recordMoodEntry;
    load: typeof loadMoodEntries;
    detectPatterns: typeof detectMoodPatterns;
    predict: typeof predictMood;
    getSummary: typeof getMoodCalendarSummary;
    buildContext: typeof buildMoodCalendarContext;
};
//# sourceMappingURL=mood-calendar.d.ts.map