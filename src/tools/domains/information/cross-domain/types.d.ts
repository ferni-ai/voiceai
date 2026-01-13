/**
 * Cross-Domain Connection Types
 *
 * Type definitions for connecting information domain to other domains.
 * This enables "Better Than Human" features like:
 * - "Rainy day → suggest indoor workout"
 * - "Stressful news → offer to skip"
 * - "Long commute → offer podcast or pep talk"
 */
/**
 * An insight generated from cross-domain analysis
 */
export interface CrossDomainInsight {
    /** Unique identifier */
    id: string;
    /** Source domain that triggered this insight */
    sourceDomain: DomainType;
    /** Target domain this insight affects */
    targetDomain: DomainType;
    /** Type of connection */
    connectionType: ConnectionType;
    /** Human-readable insight message */
    message: string;
    /** Suggested action */
    suggestion?: string;
    /** Confidence in this insight (0-1) */
    confidence: number;
    /** When this insight was generated */
    generatedAt: Date;
    /** When this insight expires */
    expiresAt: Date;
    /** Related context data */
    context: Record<string, unknown>;
}
export type DomainType = 'weather' | 'environmental' | 'news' | 'traffic' | 'sports' | 'calendar' | 'habits' | 'mood' | 'productivity' | 'wellness' | 'relationships';
export type ConnectionType = 'weather_habit' | 'weather_mood' | 'news_mood' | 'traffic_productivity' | 'sports_relationship' | 'calendar_energy' | 'environmental_wellness';
/**
 * User's current emotional state (from conversation analysis)
 */
export interface MoodContext {
    /** Current detected mood */
    currentMood: MoodState;
    /** Confidence in mood detection (0-1) */
    confidence: number;
    /** Mood trend over conversation */
    trend: 'improving' | 'stable' | 'declining';
    /** Energy level */
    energyLevel: 'high' | 'medium' | 'low';
    /** Stress indicators detected */
    stressIndicators: string[];
    /** When mood was last assessed */
    assessedAt: Date;
}
export type MoodState = 'calm' | 'happy' | 'excited' | 'anxious' | 'stressed' | 'sad' | 'frustrated' | 'tired' | 'neutral';
/**
 * Context for habit recommendations
 */
export interface HabitRecommendationContext {
    /** Current weather conditions */
    weather?: {
        isRainy: boolean;
        isHot: boolean;
        isCold: boolean;
        isNice: boolean;
    };
    /** Environmental conditions */
    environmental?: {
        airQualityGood: boolean;
        pollenHigh: boolean;
        uvHigh: boolean;
    };
    /** Time context */
    timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
    /** Is it a weekday? */
    isWeekday: boolean;
    /** User's energy level */
    energyLevel?: 'high' | 'medium' | 'low';
}
/**
 * Analysis of news content for mood impact
 */
export interface NewsMoodAnalysis {
    /** Overall sentiment of news consumed */
    overallSentiment: 'positive' | 'neutral' | 'negative' | 'heavy';
    /** Topics that might affect mood */
    heavyTopics: string[];
    /** Recommendation */
    recommendation: 'proceed' | 'summarize' | 'skip' | 'offer_break';
    /** Reason for recommendation */
    reason: string;
}
/**
 * Context for traffic-productivity connections
 */
export interface TrafficProductivityContext {
    /** Expected commute time (minutes) */
    commuteTime: number;
    /** Is commute longer than usual? */
    isLongerThanUsual: boolean;
    /** Traffic severity */
    trafficSeverity: 'light' | 'moderate' | 'heavy' | 'severe';
    /** Suggestions for commute time */
    suggestions: CommuteSuggestion[];
}
export interface CommuteSuggestion {
    type: 'podcast' | 'audiobook' | 'music' | 'call' | 'pep_talk' | 'meditation';
    reason: string;
}
/**
 * Mapping of weather conditions to habit adjustments
 */
export interface WeatherHabitMapping {
    condition: string;
    affectedHabits: string[];
    suggestion: string;
    alternatives: string[];
}
export declare const WEATHER_HABIT_MAPPINGS: WeatherHabitMapping[];
/**
 * Patterns for detecting "gray day" mood impacts
 */
export interface GrayDayPattern {
    /** Number of consecutive overcast/rainy days */
    consecutiveGrayDays: number;
    /** Threshold for mood impact */
    moodImpactThreshold: number;
    /** Suggested interventions */
    interventions: string[];
}
export declare const GRAY_DAY_INTERVENTIONS: string[];
//# sourceMappingURL=types.d.ts.map