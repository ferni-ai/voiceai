/**
 * Shared Language Evolution System
 *
 * > "Remember when you called it your 'brain goblins'? I love that."
 *
 * Tracks and reuses language that develops naturally between Ferni and the user:
 * - User's unique phrases and metaphors
 * - Nicknames for concepts ("your brain goblins", "the Sunday scaries")
 * - Shared jokes that become shorthand
 * - Callback phrases that mean something to both
 *
 * This is one of the most powerful ways to create intimacy - using "our words."
 *
 * @module @ferni/superhuman/shared-language
 */
export type SharedTermType = 'metaphor' | 'nickname' | 'catchphrase' | 'shorthand' | 'inside_term';
export interface SharedTerm {
    /** Unique identifier */
    id: string;
    /** The phrase itself */
    phrase: string;
    /** What it refers to */
    meaning: string;
    /** Type of shared term */
    type: SharedTermType;
    /** Context where it originated */
    originContext: string;
    /** When first captured */
    firstUsed: Date;
    /** Times it's been referenced */
    useCount: number;
    /** Last time it was referenced */
    lastUsed: Date;
    /** Topics this term relates to */
    relatedTopics: string[];
}
export interface SharedLanguageState {
    /** All captured shared terms */
    terms: SharedTerm[];
    /** User's communication patterns */
    speechPatterns: {
        usesMetaphors: boolean;
        prefersDirectness: boolean;
        usesSarcasm: boolean;
        formalityLevel: 'casual' | 'moderate' | 'formal';
    };
    /** Last updated */
    lastUpdated: Date;
}
export interface TermSuggestion {
    /** The term to use */
    term: SharedTerm;
    /** How to reference it */
    suggestion: string;
    /** Why it's relevant now */
    relevanceReason: string;
}
/**
 * Extract potential shared language from a user message
 */
export declare function extractSharedLanguage(userId: string, message: string, context?: {
    topics?: string[];
    emotion?: string;
}): SharedTerm | null;
/**
 * Find a shared term relevant to current conversation
 */
export declare function findRelevantTerm(userId: string, context: {
    currentTopics: string[];
    currentMessage: string;
    turnCount: number;
}): TermSuggestion | null;
/**
 * Format shared language guidance for LLM prompt
 */
export declare function formatSharedLanguageGuidance(userId: string, context: {
    currentTopics: string[];
    currentMessage: string;
    turnCount: number;
}): string | null;
/**
 * Get all shared terms for a user
 */
export declare function getSharedTerms(userId: string): SharedTerm[];
/**
 * Add a shared term manually
 */
export declare function addSharedTerm(userId: string, term: Omit<SharedTerm, 'id'>): SharedTerm;
export declare function clearSharedLanguage(): void;
export declare function getLanguageStates(): Map<string, SharedLanguageState>;
//# sourceMappingURL=shared-language.d.ts.map