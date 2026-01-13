/**
 * Response Anticipation Types
 *
 * @module response-anticipation/types
 */
/**
 * Intent categories for anticipation
 */
export type IntentCategory = 'greeting' | 'farewell' | 'affirmation' | 'negation' | 'gratitude' | 'apology' | 'question_about_self' | 'question_about_agent' | 'request_clarification' | 'emotional_disclosure' | 'task_request' | 'continuation' | 'unknown';
/**
 * Anticipated response from cache or prediction
 */
export interface AnticipatedResponse {
    /** Intent category */
    intent: IntentCategory;
    /** Confidence (0-1) */
    confidence: number;
    /** Cached response template */
    template: string;
    /** Template variables to fill */
    variables: string[];
    /** Is this a complete response or needs LLM? */
    isComplete: boolean;
    /** Context to prepend to LLM prompt */
    contextHint: string;
    /** Suggested SSML wrapper */
    ssmlHint?: string;
}
/**
 * Cached pattern entry
 */
export interface CachedPattern {
    pattern: RegExp;
    intent: IntentCategory;
    templates: string[];
    variables: string[];
    contextHint: string;
}
/**
 * Usage stats for optimization
 */
export interface CacheStats {
    hits: number;
    misses: number;
    avgHitLatencyMs: number;
    mostFrequentIntents: Array<{
        intent: IntentCategory;
        count: number;
    }>;
}
/**
 * Prefetch context hints for faster LLM response
 */
export interface PrefetchContext {
    /** Relevant user history to include */
    userHistoryHint: string;
    /** Recent topics to reference */
    recentTopics: string[];
    /** Emotional state hint */
    emotionalHint: string;
    /** Suggested persona mode */
    suggestedMode: string;
}
//# sourceMappingURL=types.d.ts.map