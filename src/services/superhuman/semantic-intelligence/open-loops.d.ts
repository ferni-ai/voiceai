/**
 * Open Loops - Proactive Intelligence V3.2
 *
 * Tracks "open loops" - things that need follow-up:
 * - Advice given (already in counterfactual, but surfacing logic here)
 * - User-stated intentions ("I'm going to talk to her tomorrow")
 * - Emotional peaks (check in after a crisis)
 * - Life events mentioned (job interview, doctor visit)
 * - Questions asked but not answered
 *
 * @module services/superhuman/semantic-intelligence/open-loops
 */
export type OpenLoopType = 'advice' | 'intention' | 'emotional_peak' | 'life_event' | 'question' | 'commitment' | 'concern';
export type OpenLoopStatus = 'open' | 'followed_up' | 'resolved' | 'expired' | 'dismissed';
export interface OpenLoop {
    id: string;
    userId: string;
    type: OpenLoopType;
    content: string;
    context: string;
    description?: string;
    created: Date;
    followUpAfter: Date;
    followUpBefore: Date;
    status: OpenLoopStatus;
    priority: number;
    followUpCount: number;
    lastFollowUp?: Date;
    resolved?: boolean;
    resolvedAt?: Date;
    resolution?: string;
    relatedPerson?: string;
    relatedTopic?: string;
    emotionAtCreation?: string;
}
/**
 * Create a new open loop.
 */
export declare function createOpenLoop(userId: string, loop: {
    type: OpenLoopType;
    content: string;
    context: string;
    followUpAfterHours?: number;
    followUpBeforeHours?: number;
    priority?: number;
    relatedPerson?: string;
    relatedTopic?: string;
    emotionAtCreation?: string;
}): Promise<OpenLoop>;
/**
 * Get open loops that are ready for follow-up.
 */
export declare function getLoopsReadyForFollowUp(userId: string): Promise<OpenLoop[]>;
/**
 * Mark a loop as followed up.
 */
export declare function markFollowedUp(userId: string, loopId: string): Promise<void>;
/**
 * Resolve an open loop.
 */
export declare function resolveLoop(userId: string, loopId: string, resolution?: string): Promise<void>;
/**
 * Dismiss a loop (user doesn't want follow-up).
 */
export declare function dismissLoop(userId: string, loopId: string): Promise<void>;
/**
 * Get all open loops for a user.
 */
export declare function getAllOpenLoops(userId: string): Promise<OpenLoop[]>;
/**
 * Get open loops by type.
 */
export declare function getLoopsByType(userId: string, type: OpenLoopType): Promise<OpenLoop[]>;
/**
 * Detect intentions, life events, and concerns in user text.
 */
export declare function detectOpenLoops(userText: string, context: {
    emotion?: string;
    emotionIntensity?: number;
    topic?: string;
    person?: string;
}): Array<{
    type: OpenLoopType;
    content: string;
    priority: number;
    relatedPerson?: string;
    relatedTopic?: string;
}>;
/**
 * Process user text and create open loops.
 */
export declare function processUserTextForLoops(userId: string, userText: string, context: {
    emotion?: string;
    emotionIntensity?: number;
    topic?: string;
    person?: string;
}): Promise<OpenLoop[]>;
/**
 * Format open loops for LLM context injection.
 */
export declare function formatOpenLoopsContext(userId: string): Promise<string>;
export declare function clearLoopCache(userId?: string): void;
export declare const openLoops: {
    create: typeof createOpenLoop;
    getReadyForFollowUp: typeof getLoopsReadyForFollowUp;
    markFollowedUp: typeof markFollowedUp;
    resolve: typeof resolveLoop;
    dismiss: typeof dismissLoop;
    getAll: typeof getAllOpenLoops;
    getByType: typeof getLoopsByType;
    detect: typeof detectOpenLoops;
    processUserText: typeof processUserTextForLoops;
    formatContext: typeof formatOpenLoopsContext;
    clearCache: typeof clearLoopCache;
};
export default openLoops;
//# sourceMappingURL=open-loops.d.ts.map