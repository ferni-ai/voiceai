/**
 * Emotional Granularity Training
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Helps users develop richer emotional vocabulary.
 * "I feel bad" → "I feel disappointed, anxious, and a little angry"
 *
 * Philosophy:
 * - Naming emotions helps regulate them
 * - Precision in language creates clarity in experience
 * - Growth in vocabulary = growth in self-understanding
 *
 * @module EmotionalGranularity
 */
export type EmotionCategory = 'anger' | 'sadness' | 'fear' | 'joy' | 'surprise' | 'disgust' | 'mixed';
export interface EmotionWord {
    word: string;
    category: EmotionCategory;
    intensity: 'low' | 'medium' | 'high';
    nuance: string;
}
export interface GranularityProfile {
    userId: string;
    emotionWordsUsed: Map<string, number>;
    uniqueWordsCount: number;
    commonVagueExpressions: string[];
    granularityScore: number;
    expansionOpportunities: number;
    expansionsAccepted: number;
    lastUpdated: Date;
}
/**
 * Detect vague emotional expressions that could be expanded
 */
export declare function detectVagueExpression(userId: string, userMessage: string): {
    isVague: boolean;
    expression?: string;
    alternatives?: string[];
    category?: EmotionCategory;
    expansionPrompt?: string;
};
/**
 * Record that user accepted vocabulary expansion
 */
export declare function recordExpansionAccepted(userId: string): void;
/**
 * Record expansion opportunity
 */
export declare function recordExpansionOffered(userId: string): void;
/**
 * Get vocabulary suggestions for an emotion category
 */
export declare function getVocabularySuggestions(category: EmotionCategory, intensity?: 'low' | 'medium' | 'high'): EmotionWord[];
/**
 * Get a teaching moment about an emotion word
 */
export declare function getEmotionTeaching(word: string): string | null;
/**
 * Build LLM context for emotional granularity
 */
export declare function buildGranularityContext(userId: string): string | null;
export declare function getGranularityScore(userId: string): number;
export declare function getTopEmotionWords(userId: string, limit?: number): Array<{
    word: string;
    count: number;
}>;
export declare function exportGranularityProfile(userId: string): GranularityProfile | null;
export declare function importGranularityProfile(profile: GranularityProfile): void;
declare const _default: {
    detectVagueExpression: typeof detectVagueExpression;
    recordExpansionAccepted: typeof recordExpansionAccepted;
    recordExpansionOffered: typeof recordExpansionOffered;
    getVocabularySuggestions: typeof getVocabularySuggestions;
    getEmotionTeaching: typeof getEmotionTeaching;
    buildGranularityContext: typeof buildGranularityContext;
    getGranularityScore: typeof getGranularityScore;
    getTopEmotionWords: typeof getTopEmotionWords;
    exportGranularityProfile: typeof exportGranularityProfile;
    importGranularityProfile: typeof importGranularityProfile;
};
export default _default;
//# sourceMappingURL=emotional-granularity.d.ts.map