/**
 * Contradiction Comfort
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Hold space for contradictory emotions without trying to fix them.
 * "You can be excited about the new job AND sad to leave the old one."
 *
 * Friends try to resolve contradictions. Ferni holds space for both truths.
 *
 * @module ContradictionComfort
 */
export type EmotionPair = [string, string];
export interface ContradictionDetection {
    /** Was a contradiction detected? */
    detected: boolean;
    /** The conflicting emotions */
    emotions: EmotionPair;
    /** Topic or situation the contradiction relates to */
    topic: string;
    /** Validation phrase to offer */
    validationPhrase: string;
    /** Confidence in detection (0-1) */
    confidence: number;
    /** Context that led to detection */
    context: {
        userMessage: string;
        recentEmotions: string[];
        markers: string[];
    };
}
export interface ContradictionPattern {
    emotions: EmotionPair;
    validations: string[];
    examples: string[];
}
export interface ContradictionHistory {
    timestamp: Date;
    emotions: EmotionPair;
    topic: string;
    validationUsed: string;
    userResponse?: 'felt_understood' | 'continued_sharing' | 'changed_topic' | 'unknown';
}
export interface ContradictionProfile {
    userId: string;
    /** History of detected contradictions */
    history: ContradictionHistory[];
    /** Common contradiction patterns for this user */
    frequentPatterns: Array<{
        emotions: EmotionPair;
        count: number;
        lastSeen: Date;
    }>;
    updatedAt: Date;
}
/**
 * Detect emotional contradictions in user message.
 */
export declare function detectContradiction(message: string, recentEmotions: string[], topic?: string): ContradictionDetection | null;
/**
 * Record a contradiction that was detected and addressed.
 */
export declare function recordContradiction(userId: string, detection: ContradictionDetection, validationUsed: string, userResponse?: 'felt_understood' | 'continued_sharing' | 'changed_topic'): Promise<void>;
/**
 * Load user's contradiction profile.
 */
export declare function loadContradictionProfile(userId: string): Promise<ContradictionProfile | null>;
/**
 * Build context for LLM when contradiction is detected.
 */
export declare function buildContradictionContext(detection: ContradictionDetection): string;
/**
 * Build general contradiction awareness context.
 */
export declare function buildContradictionAwarenessContext(userId: string): Promise<string>;
/**
 * Get a validation phrase for specific emotion pair.
 */
export declare function getValidationPhrase(emotion1: string, emotion2: string): string | null;
/**
 * Check if two emotions are known to commonly coexist.
 */
export declare function areCommonlyCoexisting(emotion1: string, emotion2: string): boolean;
export declare const contradictionComfort: {
    detectContradiction: typeof detectContradiction;
    recordContradiction: typeof recordContradiction;
    loadContradictionProfile: typeof loadContradictionProfile;
    buildContradictionContext: typeof buildContradictionContext;
    buildContradictionAwarenessContext: typeof buildContradictionAwarenessContext;
    getValidationPhrase: typeof getValidationPhrase;
    areCommonlyCoexisting: typeof areCommonlyCoexisting;
};
export default contradictionComfort;
//# sourceMappingURL=contradiction-comfort.d.ts.map