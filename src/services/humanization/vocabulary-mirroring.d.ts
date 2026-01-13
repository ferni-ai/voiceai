/**
 * Dynamic Vocabulary Mirroring
 *
 * Learns and naturally adopts the user's language patterns:
 * - Unique words they use ("recalibrate", "basically", "vibes")
 * - Their descriptors ("it's like...", "kind of...")
 * - Their emotional vocabulary ("overwhelmed", "stuck")
 * - Their intensity markers ("super", "literally", "so")
 *
 * When Ferni mirrors their vocabulary naturally, it creates:
 * - "They really get me" feeling
 * - Subliminal rapport building
 * - Authentic connection without being creepy
 *
 * "You said you felt 'recalibrating' - I love that word. That's exactly what this is."
 *
 * @module @ferni/vocabulary-mirroring
 */
/**
 * A tracked vocabulary item
 */
export interface VocabItem {
    word: string;
    category: VocabCategory;
    frequency: number;
    firstSeen: number;
    lastSeen: number;
    contexts: string[];
    /** Whether Ferni has mirrored this word */
    mirrored: boolean;
    /** How many times Ferni has used it */
    mirrorCount: number;
    /** Whether the user responded positively when mirrored */
    mirrorLanded?: boolean;
}
export type VocabCategory = 'emotional' | 'descriptor' | 'intensifier' | 'filler' | 'unique' | 'metaphor' | 'self_reference' | 'other_reference';
/**
 * User's vocabulary profile
 */
export interface VocabProfile {
    userId: string;
    items: VocabItem[];
    /** Their communication style indicators */
    style: {
        formalityLevel: 'formal' | 'casual' | 'mixed';
        intensityLevel: 'low' | 'moderate' | 'high';
        metaphorFrequency: 'rare' | 'occasional' | 'frequent';
        fillerFrequency: 'rare' | 'occasional' | 'frequent';
    };
    /** Last updated */
    updatedAt: number;
}
/**
 * Context for vocabulary analysis
 */
export interface VocabAnalysisContext {
    userMessage: string;
    turn: number;
    emotion?: string;
    topic?: string;
}
/**
 * Mirroring opportunity
 */
export interface MirrorOpportunity {
    word: string;
    category: VocabCategory;
    suggestion: string;
    confidence: number;
}
/**
 * Get or create vocabulary profile for a user
 */
export declare function getOrCreateProfile(userId: string): VocabProfile;
/**
 * Analyze a message for vocabulary
 */
export declare function analyzeVocabulary(userId: string, context: VocabAnalysisContext): VocabItem[];
/**
 * Get vocabulary to mirror in a response
 */
export declare function getMirrorOpportunities(userId: string, responseContext: {
    emotion?: string;
    topic?: string;
    isVulnerable?: boolean;
}, maxOpportunities?: number): MirrorOpportunity[];
/**
 * Generate mirroring phrases
 */
export declare function generateMirrorPhrase(word: string, category: VocabCategory, _context: {
    topic?: string;
    emotion?: string;
}): string[];
/**
 * Mark that Ferni mirrored a word
 */
export declare function markWordMirrored(userId: string, word: string, landed?: boolean): void;
/**
 * Check if a word should be mirrored
 */
export declare function shouldMirrorWord(userId: string, word: string): {
    should: boolean;
    reason: string;
};
/**
 * Get the user's communication style
 */
export declare function getUserStyle(userId: string): VocabProfile['style'] | null;
/**
 * Get top vocabulary for a user
 */
export declare function getTopVocabulary(userId: string, category?: VocabCategory, limit?: number): VocabItem[];
/**
 * Get profile summary for context injection
 */
export declare function getVocabSummary(userId: string): {
    topWords: string[];
    style: string;
    mirrorReady: string[];
};
/**
 * Clear user profile (for testing)
 */
export declare function clearUserProfile(userId: string): void;
/**
 * Clear all profiles (for testing)
 */
export declare function clearAllProfiles(): void;
export declare const vocabularyMirroring: {
    getProfile: typeof getOrCreateProfile;
    analyze: typeof analyzeVocabulary;
    getOpportunities: typeof getMirrorOpportunities;
    generatePhrase: typeof generateMirrorPhrase;
    shouldMirror: typeof shouldMirrorWord;
    markMirrored: typeof markWordMirrored;
    getStyle: typeof getUserStyle;
    getTopVocab: typeof getTopVocabulary;
    getSummary: typeof getVocabSummary;
    clearUser: typeof clearUserProfile;
    clearAll: typeof clearAllProfiles;
};
export default vocabularyMirroring;
//# sourceMappingURL=vocabulary-mirroring.d.ts.map