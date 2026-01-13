/**
 * Coaching Intelligence - V3.6
 *
 * Learns how to help THIS specific person:
 * - Advice effectiveness scoring
 * - Learning style detection
 * - Resistance patterns
 * - Communication preferences
 *
 * @module services/superhuman/semantic-intelligence/coaching-intelligence
 */
export interface AdviceEffectivenessProfile {
    userId: string;
    effectiveApproaches: {
        directSuggestions: number;
        gentleNudges: number;
        questioningApproach: number;
        storytelling: number;
        dataAndEvidence: number;
        emotionalValidation: number;
    };
    receptiveTopics: string[];
    resistantTopics: string[];
    framingPreferences: {
        positiveBased: number;
        negativeBased: number;
        neutralBased: number;
    };
    totalAdviceGiven: number;
    totalOutcomesTracked: number;
    lastUpdated: Date;
}
export interface LearningStyle {
    userId: string;
    primary: 'data_driven' | 'story_driven' | 'experience_driven' | 'reflection_driven';
    scores: {
        dataDriven: number;
        storyDriven: number;
        experienceDriven: number;
        reflectionDriven: number;
    };
    indicators: string[];
    lastUpdated: Date;
}
export interface ResistancePattern {
    userId: string;
    deflectedTopics: Array<{
        topic: string;
        deflectionCount: number;
        lastDeflection: Date;
    }>;
    closedOffPatterns: Array<{
        context: string;
        frequency: number;
    }>;
    pushbackPatterns: Array<{
        trigger: string;
        response: string;
        frequency: number;
    }>;
    lastUpdated: Date;
}
export interface CoachingRecommendation {
    approach: string;
    framing: string;
    timing: string;
    warnings: string[];
}
/**
 * Record advice outcome.
 */
export declare function recordAdviceOutcome(userId: string, outcome: {
    approach: 'direct' | 'gentle' | 'questioning' | 'story' | 'data' | 'validation';
    topic: string;
    framing: 'positive' | 'negative' | 'neutral';
    followed: boolean;
    result: 'positive' | 'negative' | 'neutral';
}): Promise<void>;
/**
 * Get effectiveness profile.
 */
export declare function getEffectivenessProfile(userId: string): Promise<AdviceEffectivenessProfile | null>;
/**
 * Get best approach for this user.
 */
export declare function getBestApproach(userId: string): Promise<{
    approach: string;
    score: number;
} | null>;
/**
 * Detect learning style from user text.
 */
export declare function detectLearningStyleFromText(text: string): Partial<LearningStyle['scores']>;
/**
 * Update learning style profile.
 */
export declare function updateLearningStyle(userId: string, text: string): Promise<void>;
/**
 * Get learning style.
 */
export declare function getLearningStyle(userId: string): Promise<LearningStyle | null>;
/**
 * Record topic deflection.
 */
export declare function recordDeflection(userId: string, topic: string): Promise<void>;
/**
 * Record pushback.
 */
export declare function recordPushback(userId: string, trigger: string, response: string): Promise<void>;
/**
 * Get resistance patterns.
 */
export declare function getResistancePattern(userId: string): Promise<ResistancePattern | null>;
/**
 * Check if topic is sensitive.
 */
export declare function isTopicSensitive(userId: string, topic: string): Promise<boolean>;
/**
 * Get coaching recommendations for this user.
 */
export declare function getCoachingRecommendations(userId: string, topic?: string): Promise<CoachingRecommendation>;
/**
 * Format coaching intelligence for LLM context.
 */
export declare function formatCoachingContext(userId: string, topic?: string): Promise<string>;
export declare function clearCoachingCache(userId?: string): void;
export declare const coachingIntelligence: {
    recordOutcome: typeof recordAdviceOutcome;
    getEffectiveness: typeof getEffectivenessProfile;
    getBestApproach: typeof getBestApproach;
    detectStyle: typeof detectLearningStyleFromText;
    updateStyle: typeof updateLearningStyle;
    getStyle: typeof getLearningStyle;
    recordDeflection: typeof recordDeflection;
    recordPushback: typeof recordPushback;
    getResistance: typeof getResistancePattern;
    isTopicSensitive: typeof isTopicSensitive;
    getRecommendations: typeof getCoachingRecommendations;
    format: typeof formatCoachingContext;
    clearCache: typeof clearCoachingCache;
};
export default coachingIntelligence;
//# sourceMappingURL=coaching-intelligence.d.ts.map