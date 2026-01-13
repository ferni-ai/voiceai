/**
 * Emotional Forecasting System
 *
 * > "Tomorrow might be tough after a conversation like this."
 *
 * Uses patterns to anticipate how the user might feel:
 * - After heavy conversations
 * - Before known stressful events
 * - Based on weekly/monthly patterns
 * - Post-decision emotional aftermath
 *
 * This helps Ferni be proactively supportive rather than reactive.
 *
 * @module @ferni/superhuman/emotional-forecasting
 */
export interface EmotionalForecast {
    /** What we predict they might feel */
    predictedEmotion: string;
    /** Confidence in this prediction (0-1) */
    confidence: number;
    /** When this is expected */
    timing: 'immediate' | 'tonight' | 'tomorrow' | 'this_week' | 'ongoing';
    /** Why we predict this */
    reason: string;
    /** Suggested acknowledgment */
    acknowledgment: string;
    /** Proactive support suggestions */
    supportSuggestions: string[];
}
export interface ForecastContext {
    /** Current emotion */
    currentEmotion: string;
    /** Emotion intensity */
    emotionIntensity: number;
    /** Topics discussed */
    topics: string[];
    /** Was there heavy sharing? */
    hadHeavySharing: boolean;
    /** Did they make a decision? */
    madeDecision: boolean;
    /** What decision (if any) */
    decisionType?: string;
    /** Upcoming events mentioned */
    upcomingEvents?: string[];
    /** Day of week */
    dayOfWeek: number;
    /** Current hour */
    hour: number;
}
/**
 * Generate emotional forecast based on conversation context
 */
export declare function generateForecast(context: ForecastContext): EmotionalForecast | null;
/**
 * Format forecast guidance for LLM prompt
 */
export declare function formatForecastGuidance(context: ForecastContext): string | null;
/**
 * Get a simple forecast acknowledgment
 */
export declare function getForecastAcknowledgment(context: ForecastContext): string | null;
/**
 * Check if we should proactively mention the forecast
 */
export declare function shouldMentionForecast(context: ForecastContext): boolean;
//# sourceMappingURL=emotional-forecasting.d.ts.map