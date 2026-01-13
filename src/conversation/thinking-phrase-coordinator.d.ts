/**
 * Thinking Phrase Coordinator
 *
 * Prevents multiple systems from independently adding "good question" type phrases.
 *
 * The Problem:
 * - thinking-time-injector.ts adds thinking sounds
 * - authentic-thinking.ts adds thinking pauses
 * - speech-naturalizer.ts adds thinking phrases
 * - All operate independently → user hears "good question" multiple times
 *
 * The Solution:
 * - Single coordinator that tracks per-turn phrase usage
 * - First system to request a phrase for a turn wins
 * - Others get null and skip adding their phrase
 *
 * @module conversation/thinking-phrase-coordinator
 */
export type ThinkingPhraseSource = 'thinking-time-injector' | 'authentic-thinking' | 'speech-naturalizer' | 'humanizer';
export interface ThinkingPhraseRequest {
    /** Session identifier */
    sessionId: string;
    /** Turn number within session */
    turnNumber: number;
    /** Which system is requesting */
    source: ThinkingPhraseSource;
    /** Persona for phrase selection */
    personaId?: string;
    /** Context for selecting appropriate phrase */
    context?: {
        isQuestion?: boolean;
        complexity?: number;
        emotionalIntensity?: number;
        topic?: string;
    };
}
export interface ThinkingPhraseResult {
    /** Whether this request was granted (first for this turn) */
    granted: boolean;
    /** The phrase to use (if granted) */
    phrase: string | null;
    /** SSML-wrapped version */
    ssml: string | null;
    /** Why this result was returned */
    reason: string;
}
interface TurnState {
    /** Which source claimed this turn */
    claimedBy: ThinkingPhraseSource | null;
    /** The phrase that was used */
    phrase: string | null;
    /** Timestamp for cleanup */
    timestamp: number;
}
declare class ThinkingPhraseCoordinator {
    /** Turn state by session */
    private turnStates;
    /** Cleanup interval */
    private cleanupInterval;
    constructor();
    /**
     * Request permission to add a thinking phrase for this turn.
     *
     * @returns Result with granted=true and phrase if this is the first request
     *          for this turn, or granted=false if another system already claimed it.
     */
    requestPhrase(request: ThinkingPhraseRequest): ThinkingPhraseResult;
    /**
     * Check if a thinking phrase was already used for this turn.
     */
    wasPhrasedUsed(sessionId: string, turnNumber: number): boolean;
    /**
     * Get what phrase was used for this turn (for debugging/logging).
     */
    getTurnState(sessionId: string, turnNumber: number): TurnState | null;
    /**
     * Reset state for a session (e.g., when session ends).
     */
    resetSession(sessionId: string): void;
    /**
     * Clean up stale entries (older than 30 minutes).
     */
    private cleanup;
    /**
     * Select an appropriate phrase based on context.
     * Now LLM-powered with fallback to templates!
     */
    private selectPhrase;
    /**
     * Calculate probability of using a thinking phrase based on context.
     */
    private calculateProbability;
    /**
     * Shutdown cleanup.
     */
    destroy(): void;
}
export declare function getThinkingPhraseCoordinator(): ThinkingPhraseCoordinator;
export declare function resetThinkingPhraseCoordinator(): void;
/**
 * Convenience function to request a thinking phrase.
 */
export declare function requestThinkingPhrase(sessionId: string, turnNumber: number, source: ThinkingPhraseSource, personaId?: string, context?: ThinkingPhraseRequest['context']): ThinkingPhraseResult;
/**
 * Convenience function to check if phrase was used.
 */
export declare function wasPhraseUsedThisTurn(sessionId: string, turnNumber: number): boolean;
export default ThinkingPhraseCoordinator;
//# sourceMappingURL=thinking-phrase-coordinator.d.ts.map