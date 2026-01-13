/**
 * Wisdom Synthesis - Cross-User Pattern Learning
 *
 * Phase 33: Learn from population-level patterns while preserving privacy.
 * Anonymous aggregation of what works, personalized to individuals.
 *
 * CORE INSIGHT: Ferni can learn from millions of conversations what
 * approaches work for different situations—something no human coach can do.
 *
 * PRIVACY FIRST:
 * - All patterns are anonymized and aggregated
 * - No individual conversations are stored or shared
 * - Users can opt out entirely
 * - Insights are generic (not traceable to individuals)
 *
 * @module WisdomSynthesis
 */
export interface SituationType {
    category: 'emotional' | 'relational' | 'behavioral' | 'cognitive' | 'life_event';
    subcategory: string;
    description: string;
}
export interface ApproachPattern {
    id: string;
    situation: SituationType;
    approach: string;
    technique: string;
    /** Anonymized effectiveness data */
    stats: {
        timesUsed: number;
        helpfulCount: number;
        helpfulRate: number;
        averageRating: number;
    };
    /** Contextual factors that increase effectiveness */
    worksWellWhen: string[];
    /** Contextual factors that decrease effectiveness */
    worksLessWellWhen: string[];
    /** Sample phrasing (not from actual conversations) */
    examplePhrasing?: string;
}
export interface PersonalizedWisdom {
    userId: string;
    situation: SituationType;
    recommendedApproaches: Array<{
        approach: ApproachPattern;
        personalFit: number;
        reasoning: string;
    }>;
    generatedAt: Date;
}
export interface UserPreferences {
    userId: string;
    preferredApproaches: string[];
    dislikedApproaches: string[];
    effectivenessHistory: Map<string, {
        helpful: number;
        total: number;
    }>;
}
export interface WisdomContribution {
    situationType: SituationType;
    approachUsed: string;
    wasHelpful: boolean;
    userRating?: number;
    contextFactors?: string[];
}
/**
 * Get personalized wisdom for a situation.
 */
export declare function getPersonalizedWisdom(userId: string, situation: SituationType, contextFactors?: string[]): PersonalizedWisdom;
/**
 * Contribute wisdom from a conversation (anonymized).
 */
export declare function contributeWisdom(contribution: WisdomContribution): void;
/**
 * Record user preference.
 */
export declare function recordUserPreference(userId: string, approachId: string, wasHelpful: boolean): void;
/**
 * Get wisdom context for LLM injection.
 */
export declare function getWisdomContextInjection(userId: string, situation: SituationType): string;
/**
 * Get population insights for a situation type.
 */
export declare function getPopulationInsights(situation: SituationType): {
    topApproaches: Array<{
        technique: string;
        helpfulRate: number;
    }>;
    commonPatterns: string[];
    averageHelpfulness: number;
};
export interface NewPattern {
    situation: SituationType;
    approach: string;
    occurrences: number;
    preliminaryRate: number;
}
/**
 * Discover new patterns from recent contributions (scheduled job).
 * In production, this would analyze recent contributions for emerging patterns.
 */
export declare function discoverNewPatterns(): NewPattern[];
/**
 * Aggregate and update population wisdom (scheduled job).
 * In production, this would:
 * 1. Recalculate effectiveness rates from all contributions
 * 2. Identify patterns that should be promoted/demoted
 * 3. Update the wisdom database
 */
export declare function aggregatePopulationWisdom(): {
    newInsights: number;
    updatedPatterns: number;
};
export declare const wisdomSynthesis: {
    getWisdom: typeof getPersonalizedWisdom;
    contribute: typeof contributeWisdom;
    recordPreference: typeof recordUserPreference;
    getContext: typeof getWisdomContextInjection;
    getInsights: typeof getPopulationInsights;
    discoverNewPatterns: typeof discoverNewPatterns;
    aggregatePopulationWisdom: typeof aggregatePopulationWisdom;
};
export default wisdomSynthesis;
//# sourceMappingURL=index.d.ts.map