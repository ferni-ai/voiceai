/**
 * Linguistic Mirroring
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Learn and mirror their vocabulary for deeper connection.
 * Ferni starts naturally using their phrases back to them.
 *
 * We use our words, not theirs. Ferni learns THEIR exact vocabulary:
 * - Their preferred terms for emotions ("freaking out" vs "anxious")
 * - Signature phrases they use often
 * - Words they avoid (might indicate discomfort)
 * - Speech patterns and formality level
 *
 * @module LinguisticMirroring
 */
export type FormalityLevel = 'casual' | 'moderate' | 'formal';
export interface SignaturePhrase {
    phrase: string;
    frequency: number;
    contexts: string[];
    lastUsed: Date;
}
export interface AvoidedWord {
    word: string;
    inferredReason?: string;
    detectedAt: Date;
    confidenceAvoided: number;
}
export interface SpeechPatterns {
    avgSentenceLength: number;
    usesFillers: boolean;
    prefersContractions: boolean;
    formalityLevel: FormalityLevel;
    commonFillers: string[];
    paceIndicator: 'fast' | 'moderate' | 'slow';
}
export interface LinguisticProfile {
    userId: string;
    /** Their preferred terms for emotions */
    emotionVocabulary: Record<string, string[]>;
    /** Phrases they use often */
    signaturePhrases: SignaturePhrase[];
    /** Words they avoid (might indicate discomfort) */
    avoidedWords: AvoidedWord[];
    /** Speech patterns */
    speechPatterns: SpeechPatterns;
    /** Sample messages for learning */
    recentMessages: Array<{
        message: string;
        timestamp: Date;
        topic?: string;
    }>;
    updatedAt: Date;
}
/**
 * Extract and record linguistic patterns from user message.
 */
export declare function recordLinguisticPatterns(userId: string, message: string, context?: {
    topic?: string;
    emotion?: string;
}): void;
/**
 * Adapt Ferni's response to match user's linguistic style.
 */
export declare function adaptResponseStyle(response: string, userId: string): string;
/**
 * Get their preferred term for an emotion.
 */
export declare function getTheirWordFor(userId: string, emotion: string): string | null;
/**
 * Check if they avoid a word.
 */
export declare function isWordAvoided(userId: string, word: string): boolean;
/**
 * Build context for LLM injection.
 */
export declare function buildLinguisticContext(userId: string): string;
/**
 * Get profile for user.
 */
export declare function getLinguisticProfile(userId: string): LinguisticProfile | null;
/**
 * Save profile to Firestore.
 */
export declare function saveLinguisticProfile(userId: string): Promise<void>;
/**
 * Load profile from Firestore.
 */
export declare function loadLinguisticProfile(userId: string): Promise<void>;
export declare const linguisticMirroring: {
    recordLinguisticPatterns: typeof recordLinguisticPatterns;
    adaptResponseStyle: typeof adaptResponseStyle;
    getTheirWordFor: typeof getTheirWordFor;
    isWordAvoided: typeof isWordAvoided;
    buildLinguisticContext: typeof buildLinguisticContext;
    getLinguisticProfile: typeof getLinguisticProfile;
    saveLinguisticProfile: typeof saveLinguisticProfile;
    loadLinguisticProfile: typeof loadLinguisticProfile;
};
export default linguisticMirroring;
//# sourceMappingURL=linguistic-mirroring.d.ts.map