/**
 * Temporal Patterns - V3.4 Temporal Intelligence
 *
 * Tracks time-based patterns in the user's life:
 * - Circadian patterns (morning anxiety, evening calm)
 * - Day-of-week patterns (Monday stress, weekend joy)
 * - Seasonal patterns (winter blues, summer energy)
 * - Life stage awareness
 *
 * @module services/superhuman/semantic-intelligence/temporal-patterns
 */
export interface HourlyPattern {
    hour: number;
    dominantEmotions: Map<string, number>;
    energyLevel: number;
    receptivity: number;
    commonTopics: string[];
    sampleSize: number;
}
export interface DayOfWeekPattern {
    day: number;
    dominantEmotions: Map<string, number>;
    energyLevel: number;
    stressLevel: number;
    commonTopics: string[];
    sampleSize: number;
}
export interface SeasonalPattern {
    season: 'spring' | 'summer' | 'fall' | 'winter';
    moodBaseline: number;
    energyBaseline: number;
    commonThemes: string[];
    warnings: string[];
}
export interface LifeStageIndicator {
    stage: string;
    confidence: number;
    indicators: string[];
    since?: Date;
}
export interface TemporalSnapshot {
    timestamp: Date;
    hourOfDay: number;
    dayOfWeek: number;
    month: number;
    emotion?: string;
    dominantEmotion?: string;
    emotionIntensity?: number;
    topic?: string;
    energyLevel?: number;
}
export interface TemporalContext {
    currentHourPattern?: HourlyPattern;
    currentDayPattern?: DayOfWeekPattern;
    seasonalContext?: string;
    anomaly?: string;
    recommendation?: string;
}
/**
 * Record a temporal snapshot.
 */
export declare function recordSnapshot(userId: string, data: {
    emotion?: string;
    emotionIntensity?: number;
    topic?: string;
    energyLevel?: number;
}): Promise<void>;
/**
 * Get hourly pattern for a specific hour.
 */
export declare function getHourlyPattern(userId: string, hour?: number): Promise<HourlyPattern | null>;
/**
 * Get day-of-week pattern.
 */
export declare function getDayPattern(userId: string, day?: number): Promise<DayOfWeekPattern | null>;
/**
 * Get seasonal pattern.
 */
export declare function getSeasonalPattern(userId: string, season?: 'spring' | 'summer' | 'fall' | 'winter'): Promise<SeasonalPattern | null>;
/**
 * Get full temporal context for current moment.
 */
export declare function getTemporalContext(userId: string): Promise<TemporalContext>;
/**
 * Detect if current behavior is unusual.
 */
export declare function detectAnomaly(userId: string, current: {
    emotion?: string;
    topic?: string;
    energyLevel?: number;
}): Promise<string | null>;
/**
 * Format temporal patterns for LLM context.
 */
export declare function formatTemporalContext(userId: string): Promise<string>;
export declare function clearTemporalCache(userId?: string): void;
/**
 * Prediction result from temporal pattern analysis.
 * Used by session-init-handler Phase 6.6 for predictive emotional state.
 */
export interface PatternPrediction {
    /** Predicted mood based on time patterns */
    predictedMood?: string;
    /** Predicted energy level (0-1) */
    predictedEnergy?: number;
    /** Topics likely to come up based on temporal patterns */
    predictedTopics?: string[];
    /** Confidence in the prediction (0-1) */
    confidence: number;
    /** Basis for the prediction */
    basis: string;
    /** Time period this prediction applies to */
    timeContext?: string;
}
/**
 * Get pattern-based prediction for the user's current state.
 * Combines hourly, daily, and seasonal patterns to predict mood, energy, and topics.
 *
 * @param userId - The user ID
 * @returns Prediction with mood, energy, topics, and confidence
 */
export declare function getPatternPrediction(userId: string): Promise<PatternPrediction>;
export declare const temporalPatterns: {
    record: typeof recordSnapshot;
    getHourlyPattern: typeof getHourlyPattern;
    getDayPattern: typeof getDayPattern;
    getSeasonalPattern: typeof getSeasonalPattern;
    getContext: typeof getTemporalContext;
    detectAnomaly: typeof detectAnomaly;
    format: typeof formatTemporalContext;
    clearCache: typeof clearTemporalCache;
    getPatternPrediction: typeof getPatternPrediction;
};
export default temporalPatterns;
//# sourceMappingURL=temporal-patterns.d.ts.map