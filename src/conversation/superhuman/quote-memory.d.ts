/**
 * Quote Memory System
 *
 * "Last time you said..." - The most powerful way to show someone you listened.
 *
 * This system captures memorable quotes from users and surfaces them at the
 * perfect moment, creating that magical "you actually remember that?" feeling.
 *
 * @module conversation/superhuman/quote-memory
 */
export interface UserQuote {
    id: string;
    userId: string;
    quote: string;
    context: string;
    emotion: string;
    timestamp: Date;
    sessionId: string;
    topics: string[];
    isWisdom: boolean;
    isVulnerable: boolean;
    isFunny: boolean;
    isGoal: boolean;
    surfacedCount: number;
    lastSurfaced?: Date;
}
export interface QuoteSurfaceContext {
    userId: string;
    currentTopic?: string;
    currentEmotion?: string;
    relationshipStage: 'stranger' | 'acquaintance' | 'friend' | 'trusted';
    turnCount: number;
}
export interface QuoteSuggestion {
    quote: UserQuote;
    relevanceScore: number;
    suggestedIntro: string;
    reason: string;
}
/**
 * Extract a memorable quote from a user message
 */
export declare function extractQuote(userId: string, message: string, context: {
    sessionId: string;
    topics?: string[];
    emotion?: string;
}): UserQuote | null;
/**
 * Save a quote to the store
 */
export declare function saveQuote(quote: UserQuote): void;
/**
 * Extract and save a quote in one call
 */
export declare function captureQuote(userId: string, message: string, context: {
    sessionId: string;
    topics?: string[];
    emotion?: string;
}): UserQuote | null;
/**
 * Find a relevant quote to surface
 */
export declare function findRelevantQuote(context: QuoteSurfaceContext): QuoteSuggestion | null;
/**
 * Mark a quote as surfaced (call after using it)
 */
export declare function markQuoteSurfaced(userId: string, quoteId: string): void;
/**
 * Format a quote suggestion for the prompt
 */
export declare function formatQuoteForPrompt(suggestion: QuoteSuggestion): string;
declare const _default: {
    captureQuote: typeof captureQuote;
    extractQuote: typeof extractQuote;
    saveQuote: typeof saveQuote;
    findRelevantQuote: typeof findRelevantQuote;
    markQuoteSurfaced: typeof markQuoteSurfaced;
    formatQuoteForPrompt: typeof formatQuoteForPrompt;
};
export default _default;
//# sourceMappingURL=quote-memory.d.ts.map