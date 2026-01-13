/**
 * Inside Joke Memory - Better Than Human Shared History
 *
 * Builds and recalls shared moments, callbacks, and inside jokes:
 * - Remembers funny moments from past conversations
 * - Creates natural callbacks to shared history
 * - Builds relationship depth through "our things"
 *
 * WHY IT'S SUPERHUMAN: Builds genuine shared history like a lifelong friend,
 * but with perfect recall. Creates the "you had to be there" feeling.
 *
 * @module services/superhuman/inside-joke-memory
 */
export type SharedMomentType = 'inside_joke' | 'callback' | 'shared_discovery' | 'memorable_quote' | 'silly_moment' | 'breakthrough' | 'running_gag' | 'nickname' | 'tradition';
export interface SharedMoment {
    id?: string;
    userId: string;
    type: SharedMomentType;
    /** The essence of the moment */
    essence: string;
    /** Full context */
    context: string;
    /** Keywords to trigger recall */
    triggerKeywords: string[];
    /** How to reference it naturally */
    callbackPhrase: string;
    /** Times referenced */
    timesReferenced: number;
    /** Original timestamp */
    createdAt: number;
    /** Last referenced */
    lastReferencedAt?: number;
    /** Emotional resonance (how much joy it brings) 0-1 */
    resonance: number;
}
export interface CallbackOpportunity {
    moment: SharedMoment;
    triggerMatch: string;
    naturalCallback: string;
    appropriateness: number;
}
/**
 * Record a shared moment worth remembering.
 */
export declare function recordSharedMoment(userId: string, type: SharedMomentType, essence: string, context: string, triggerKeywords: string[], callbackPhrase: string, resonance?: number): Promise<string | null>;
/**
 * Load shared moments.
 */
export declare function loadSharedMoments(userId: string): Promise<SharedMoment[]>;
/**
 * Update a moment after referencing it.
 */
export declare function recordMomentReference(userId: string, momentId: string): Promise<void>;
/**
 * Find callback opportunities in the current conversation.
 */
export declare function findCallbackOpportunities(text: string, moments: SharedMoment[], currentMood?: 'positive' | 'neutral' | 'negative'): CallbackOpportunity[];
/**
 * Detect if current conversation has a moment worth saving.
 * This is a heuristic - ideally LLM would help identify these.
 */
export declare function detectPotentialMoment(text: string, context: 'user' | 'ferni'): {
    isPotential: boolean;
    type?: SharedMomentType;
    essence?: string;
};
/**
 * Get running gags (things referenced multiple times).
 */
export declare function identifyRunningGags(moments: SharedMoment[]): SharedMoment[];
/**
 * Build context for LLM injection.
 */
export declare function buildInsideJokeContext(userId: string, currentText?: string): Promise<string>;
/**
 * Generate callback suggestion for LLM.
 */
export declare function suggestCallback(opportunity: CallbackOpportunity): string;
export declare const insideJokeMemory: {
    record: typeof recordSharedMoment;
    load: typeof loadSharedMoments;
    recordReference: typeof recordMomentReference;
    findCallbacks: typeof findCallbackOpportunities;
    detectMoment: typeof detectPotentialMoment;
    getRunningGags: typeof identifyRunningGags;
    buildContext: typeof buildInsideJokeContext;
    suggestCallback: typeof suggestCallback;
};
//# sourceMappingURL=inside-joke-memory.d.ts.map