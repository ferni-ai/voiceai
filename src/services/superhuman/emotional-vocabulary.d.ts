/**
 * Emotional Vocabulary Expansion - Better Than Human EQ Development
 *
 * Helps users develop emotional intelligence by:
 * - Recognizing when they use vague emotion words ("bad", "fine", "stressed")
 * - Offering more precise alternatives
 * - Building their emotional vocabulary over time
 * - Tracking which emotions they commonly experience
 *
 * WHY IT'S SUPERHUMAN: Helps users name feelings more precisely than
 * any human friend would, developing their long-term emotional intelligence.
 *
 * @module services/superhuman/emotional-vocabulary
 */
export type EmotionCategory = 'joy' | 'sadness' | 'anger' | 'fear' | 'surprise' | 'disgust' | 'trust' | 'anticipation';
export interface EmotionWord {
    word: string;
    category: EmotionCategory;
    intensity: 'low' | 'medium' | 'high';
    nuance: string;
}
export interface VagueEmotionMapping {
    vagueWord: string;
    possibleMeanings: EmotionWord[];
    clarifyingQuestion: string;
}
export interface EmotionUsageRecord {
    userId: string;
    emotionWord: string;
    category: EmotionCategory;
    context?: string;
    timestamp: number;
}
export interface EmotionalVocabularyProfile {
    userId: string;
    /** Emotions they use frequently */
    frequentEmotions: Map<string, number>;
    /** Emotions they rarely name */
    underusedCategories: EmotionCategory[];
    /** Vocabulary richness score */
    vocabularyScore: number;
    /** Suggested expansions */
    suggestedExpansions: string[];
    /** Last updated */
    lastUpdated: number;
}
/**
 * Detect vague emotion words in text and offer expansions.
 */
export declare function detectVagueEmotions(text: string): VagueEmotionMapping[];
/**
 * Get suggested emotion words based on context.
 */
export declare function suggestPreciseEmotions(category: EmotionCategory, intensityHint?: 'low' | 'medium' | 'high'): EmotionWord[];
/**
 * Record an emotion word usage.
 */
export declare function recordEmotionUsage(userId: string, emotionWord: string, context?: string): Promise<void>;
/**
 * Load emotion usage history.
 */
export declare function loadEmotionHistory(userId: string, daysBack?: number): Promise<EmotionUsageRecord[]>;
/**
 * Analyze user's emotional vocabulary.
 */
export declare function analyzeVocabularyProfile(userId: string): Promise<EmotionalVocabularyProfile>;
/**
 * Build context for LLM injection when vague emotions detected.
 */
export declare function buildVagueEmotionContext(detectedVague: VagueEmotionMapping[]): string;
/**
 * Build general vocabulary context.
 */
export declare function buildVocabularyContext(userId: string): Promise<string>;
export declare const emotionalVocabulary: {
    detect: typeof detectVagueEmotions;
    suggest: typeof suggestPreciseEmotions;
    record: typeof recordEmotionUsage;
    loadHistory: typeof loadEmotionHistory;
    analyzeProfile: typeof analyzeVocabularyProfile;
    buildVagueContext: typeof buildVagueEmotionContext;
    buildContext: typeof buildVocabularyContext;
    dictionary: EmotionWord[];
};
//# sourceMappingURL=emotional-vocabulary.d.ts.map