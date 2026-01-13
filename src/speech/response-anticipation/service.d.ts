/**
 * Response Anticipation Service
 *
 * Session-scoped service for anticipating user responses.
 *
 * @module response-anticipation/service
 */
import type { AnticipatedResponse, CacheStats, IntentCategory } from './types.js';
/**
 * Response anticipation service
 *
 * Reduces perceived latency by ~100-200ms on cache hits.
 */
export declare class ResponseAnticipationService {
    private sessionId;
    private stats;
    private intentCounts;
    private lastAnticipation;
    private personaId;
    private pendingCacheHit;
    constructor(sessionId: string);
    /**
     * Configure persona for template selection
     */
    setPersona(personaId: string): void;
    /**
     * Anticipate response from partial transcript.
     * Call this while user is still speaking.
     */
    anticipate(partialTranscript: string): AnticipatedResponse | null;
    /**
     * Get context hint for LLM if no complete response
     */
    getContextHintForLLM(finalTranscript: string): string | null;
    /**
     * Get complete response if available
     */
    getCompleteResponse(): {
        response: string;
        ssml: string;
    } | null;
    /**
     * Fill template variables
     */
    private fillVariables;
    /**
     * Get SSML hint for intent
     */
    private getSsmlHintForIntent;
    /**
     * Report if last anticipation was correct (for learning)
     */
    reportAccuracy(wasCorrect: boolean): void;
    /**
     * Get cache statistics
     */
    getStats(): CacheStats;
    /**
     * Get hit rate
     */
    getHitRate(): number;
    /**
     * Clear last anticipation (after response sent)
     */
    clearAnticipation(): void;
    /**
     * Mark that a cache hit is ready to use
     */
    markCacheHit(intent: IntentCategory): void;
    /**
     * Check if there's a cache hit waiting to be used
     */
    hasCacheHit(): boolean;
    /**
     * Consume the cache hit (returns intent and clears the flag)
     */
    consumeCacheHit(): IntentCategory | null;
    /**
     * Reset service state
     */
    reset(): void;
}
/**
 * Get response anticipation service for a session
 */
export declare function getResponseAnticipationService(sessionId: string): ResponseAnticipationService;
/**
 * Reset response anticipation service for a session
 */
export declare function resetResponseAnticipationService(sessionId: string): void;
/**
 * Get count of active response anticipation instances
 */
export declare function getActiveResponseAnticipationCount(): number;
//# sourceMappingURL=service.d.ts.map