/**
 * Boundary Memory
 *
 * Remembering what NOT to bring up - the sacred trust of respecting
 * what someone has told you is off-limits.
 *
 * Philosophy: Breaking trust by mentioning something painful is the
 * fastest way to lose someone. A great friend remembers not just what
 * to say, but what NOT to say.
 *
 * This system tracks:
 * - Explicit boundaries ("I don't want to talk about X")
 * - Topics that caused distress
 * - Sensitive areas to approach carefully
 * - Preferences about depth/probing
 *
 * @module BoundaryMemory
 */
export interface Boundary {
    id: string;
    /** What the boundary is about */
    topic: string;
    /** Keywords/phrases to avoid that relate to this boundary */
    relatedTerms: string[];
    /** How the boundary was established */
    type: 'explicit' | 'inferred_distress' | 'repeated_avoidance' | 'sensitive_area';
    /** How strictly to honor this */
    strength: 'absolute' | 'strong' | 'moderate';
    /** When this boundary was established */
    establishedAt: Date;
    /** The context in which it was established */
    context: string;
    /** Whether user ever reopened this topic themselves */
    userReopened: boolean;
    /** Last time user mentioned this (if ever) */
    lastUserMention?: Date;
}
export interface BoundaryProfile {
    userId: string;
    /** Active boundaries */
    boundaries: Boundary[];
    /** General preferences about depth */
    depthPreferences: {
        /** How much probing is welcome */
        probingTolerance: 'high' | 'medium' | 'low';
        /** Topics they're open to deep discussion about */
        deepTopics: string[];
        /** Topics to keep light */
        surfaceOnlyTopics: string[];
    };
    /** Times we respected a boundary (for learning) */
    boundaryRespects: Array<{
        boundaryId: string;
        timestamp: Date;
        wasAppreciated: boolean;
    }>;
}
export interface BoundaryCheckResult {
    /** Whether this topic crosses a boundary */
    crossesBoundary: boolean;
    /** The boundary being crossed (if any) */
    boundary?: Boundary;
    /** Recommendation for how to proceed */
    recommendation: 'avoid_completely' | 'approach_carefully' | 'okay_if_user_initiated' | 'proceed_normally';
    /** If approaching carefully, suggested framing */
    carefulApproach?: string;
}
/**
 * Detect if a user message establishes a new boundary
 */
export declare function detectNewBoundary(userId: string, userMessage: string, context: {
    currentTopic?: string;
    recentTopic?: string;
    emotionDetected?: string;
    emotionIntensity?: number;
}): Boundary | null;
/**
 * Check if an AI response would cross any boundaries
 */
export declare function checkBoundary(userId: string, proposedContent: string, context: {
    userInitiatedTopic?: boolean;
    currentTopic?: string;
}): BoundaryCheckResult;
/**
 * Check if a topic should be avoided entirely
 */
export declare function isTopicOffLimits(userId: string, topic: string): boolean;
/**
 * Get all active boundaries for a user
 */
export declare function getActiveBoundaries(userId: string): Boundary[];
/**
 * Record that user reopened a bounded topic
 */
export declare function recordUserReopened(userId: string, topic: string): void;
/**
 * Record that we respected a boundary (for learning)
 */
export declare function recordBoundaryRespect(userId: string, boundaryId: string, wasAppreciated: boolean): void;
/**
 * Update user's probing tolerance based on reactions
 */
export declare function updateProbingTolerance(userId: string, reaction: 'welcomed' | 'neutral' | 'resisted'): void;
/**
 * Get recommended probing depth for this user
 */
export declare function getProbingDepth(userId: string): 'high' | 'medium' | 'low';
/**
 * Export boundaries for persistence
 */
export declare function exportBoundaries(userId: string): BoundaryProfile | null;
/**
 * Import boundaries from persistence
 */
export declare function importBoundaries(profile: BoundaryProfile): void;
/**
 * Premature advice tracking - remembering when advice wasn't welcome.
 * "Your friend forgets you asked them not to give advice. Ferni remembers forever."
 */
export interface PrematureAdviceRecord {
    id: string;
    advice: string;
    context: string;
    topic: string;
    userReaction: 'defensive' | 'dismissed' | 'overwhelmed' | 'accepted';
    timestamp: Date;
    waitUntil: 'they_bring_it_up' | 'milestone' | 'crisis_passes' | 'never';
    canRetryAfter?: Date;
}
/**
 * Boundary softening - detecting when a hard boundary may be relaxing.
 */
export interface BoundarySoftening {
    boundaryId: string;
    topic: string;
    signs: Array<{
        timestamp: Date;
        indicator: string;
        confidenceOfSoftening: number;
    }>;
    readyToReapproach: boolean;
    suggestedApproach?: string;
}
/**
 * Record when advice was given at the wrong time.
 */
export declare function recordPrematureAdvice(userId: string, advice: string, topic: string, reaction: PrematureAdviceRecord['userReaction']): void;
/**
 * Check if we should avoid giving advice about a topic.
 */
export declare function shouldAvoidAdviceAbout(userId: string, topic: string): {
    shouldAvoid: boolean;
    reason?: string;
    waitUntil?: string;
};
/**
 * Get all premature advice records for context.
 */
export declare function getPrematureAdviceRecords(userId: string): PrematureAdviceRecord[];
/**
 * Detect signs that a boundary may be softening.
 */
export declare function detectBoundarySoftening(userId: string, topic: string, indicator: string): BoundarySoftening | null;
/**
 * Check if a boundary is showing signs of softening.
 */
export declare function getBoundarySoftening(userId: string, topic: string): BoundarySoftening | null;
/**
 * Build protective memory context for LLM injection.
 */
export declare function buildProtectiveMemoryContext(userId: string): string;
declare const _default: {
    detectNewBoundary: typeof detectNewBoundary;
    checkBoundary: typeof checkBoundary;
    isTopicOffLimits: typeof isTopicOffLimits;
    getActiveBoundaries: typeof getActiveBoundaries;
    recordUserReopened: typeof recordUserReopened;
    recordBoundaryRespect: typeof recordBoundaryRespect;
    updateProbingTolerance: typeof updateProbingTolerance;
    getProbingDepth: typeof getProbingDepth;
    exportBoundaries: typeof exportBoundaries;
    importBoundaries: typeof importBoundaries;
    recordPrematureAdvice: typeof recordPrematureAdvice;
    shouldAvoidAdviceAbout: typeof shouldAvoidAdviceAbout;
    getPrematureAdviceRecords: typeof getPrematureAdviceRecords;
    detectBoundarySoftening: typeof detectBoundarySoftening;
    getBoundarySoftening: typeof getBoundarySoftening;
    buildProtectiveMemoryContext: typeof buildProtectiveMemoryContext;
};
export default _default;
//# sourceMappingURL=boundary-memory.d.ts.map