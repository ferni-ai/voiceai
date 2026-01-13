/**
 * Curiosity Engine
 *
 * > "I've been wondering about that thing you mentioned..."
 *
 * Creates genuine, invested interest in the user's life:
 *
 * - **Thread Tracking**: Remember unresolved conversation threads
 * - **Follow-Up Questions**: Ask about things they mentioned
 * - **Detail Remembering**: "You said your sister's name was Sarah, right?"
 * - **Life Investment**: Show we're paying attention across conversations
 * - **Curious Probing**: Go deeper without being intrusive
 *
 * This is what makes someone feel truly known and cared about.
 *
 * @module @ferni/curiosity-engine
 */
export interface ConversationThread {
    /** Unique ID */
    id: string;
    /** What was mentioned */
    content: string;
    /** Category of thread */
    category: 'person' | 'event' | 'situation' | 'feeling' | 'goal' | 'problem' | 'story' | 'decision' | 'question';
    /** When first mentioned */
    introducedTurn: number;
    /** When last referenced */
    lastReferencedTurn: number;
    /** Is this resolved? */
    resolved: boolean;
    /** Context around the mention */
    context?: string;
    /** Importance level */
    importance: 'low' | 'medium' | 'high';
    /** Related details */
    details: string[];
    /** Times we've asked about it */
    followUpCount: number;
}
export interface LifeDetail {
    /** Category */
    category: 'person' | 'place' | 'job' | 'hobby' | 'pet' | 'relationship' | 'other';
    /** The detail */
    content: string;
    /** Name if applicable */
    name?: string;
    /** When learned */
    learnedTurn: number;
    /** Related threads */
    relatedThreads: string[];
}
export interface CuriosityPrompt {
    /** The question or prompt */
    question: string;
    /** Type of curiosity */
    type: 'follow_up' | 'detail_check' | 'life_investment' | 'deepening' | 'callback';
    /** Related thread ID */
    threadId?: string;
    /** Confidence this is appropriate */
    confidence: number;
    /** Is this time-sensitive? */
    timeSensitive: boolean;
}
export interface CuriosityState {
    /** Unresolved threads */
    unresolvedThreads: ConversationThread[];
    /** Life details we've learned */
    lifeDetails: LifeDetail[];
    /** Things we've been curious about */
    curiosityHistory: Array<{
        question: string;
        turn: number;
        wasWellReceived?: boolean;
    }>;
    /** Current turn */
    turnCount: number;
}
export declare class CuriosityEngine {
    private threads;
    private lifeDetails;
    private curiosityHistory;
    private turnCount;
    private lastCuriosityTurn;
    private readonly MIN_CURIOSITY_INTERVAL;
    private readonly MAX_FOLLOW_UPS_PER_THREAD;
    private readonly MAX_CURIOSITY_PER_SESSION;
    constructor();
    /**
     * Process a user message to extract threads and details
     */
    processMessage(message: string, turnCount: number): void;
    /**
     * Get a curiosity prompt if appropriate
     *
     * @param turnCount - Current turn
     * @param recentTopics - Recent conversation topics
     * @returns Curiosity prompt or null
     */
    getCuriosityPrompt(turnCount: number, recentTopics?: string[]): CuriosityPrompt | null;
    /**
     * Get a deepening question for current topic
     */
    getDeepeningQuestion(): string;
    /**
     * Record whether a curiosity prompt was well-received
     */
    recordCuriosityOutcome(wasWellReceived: boolean): void;
    /**
     * Get unresolved threads
     */
    getUnresolvedThreads(): ConversationThread[];
    /**
     * Get life details
     */
    getLifeDetails(): LifeDetail[];
    /**
     * Get state for persistence
     */
    getState(): CuriosityState;
    /**
     * Load state from persistence
     */
    loadState(state: Partial<CuriosityState>): void;
    /**
     * Reset for new conversation (keeps cross-session data)
     */
    resetSession(): void;
    /**
     * Full reset
     */
    reset(): void;
    private extractLifeDetails;
    private extractThreads;
    private checkForResolutions;
    private findSimilarThread;
    private findBestCuriosityPrompt;
}
export declare function getCuriosityEngine(userId: string): CuriosityEngine;
export declare function resetCuriosityEngine(userId: string): void;
export declare function clearCuriosityEngine(userId: string): void;
export declare function getActiveCuriosityEngineCount(): number;
export default CuriosityEngine;
//# sourceMappingURL=curiosity-engine.d.ts.map