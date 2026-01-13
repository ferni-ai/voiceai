/**
 * Protective Silence - Better Than Human Boundary Memory
 *
 * Remembers what NOT to say - topics to avoid, sensitive areas, and
 * emotional landmines that could hurt this person.
 *
 * WHY IT'S SUPERHUMAN: Most friends accidentally step on emotional landmines.
 * Ferni remembers them all and never forgets a boundary.
 *
 * @module services/superhuman/protective-silence
 */
export type BoundarySeverity = 'never' | 'only_if_they_bring_up' | 'gentle_only' | 'time_sensitive';
export type BoundaryCategory = 'loss' | 'trauma' | 'health' | 'family' | 'relationship' | 'work' | 'financial' | 'identity' | 'comparison' | 'achievement' | 'other';
export interface ProtectiveBoundary {
    id?: string;
    userId: string;
    /** The topic or subject to avoid */
    topic: string;
    /** How severe is this boundary */
    severity: BoundarySeverity;
    /** Category of the boundary */
    category: BoundaryCategory;
    /** Why this is sensitive (context for LLM) */
    reason?: string;
    /** Keywords that might trigger this topic */
    triggerKeywords: string[];
    /** Safe alternative topics to redirect to */
    safeAlternatives?: string[];
    /** When this expires (for time-sensitive boundaries) */
    expiresAt?: number;
    /** When was this created */
    createdAt: number;
    /** Last time this was confirmed still sensitive */
    lastConfirmed?: number;
    /** Source: did user explicitly state this or was it inferred */
    source: 'user_stated' | 'inferred' | 'detected_reaction';
}
export interface BoundaryCheckResult {
    isSafe: boolean;
    matchedBoundaries: ProtectiveBoundary[];
    guidance: string;
    alternatives?: string[];
}
/**
 * Record a new protective boundary.
 */
export declare function recordBoundary(userId: string, boundary: Omit<ProtectiveBoundary, 'id' | 'userId' | 'createdAt'>): Promise<string | null>;
/**
 * Update or confirm a boundary.
 */
export declare function updateBoundary(userId: string, boundaryId: string, updates: Partial<Pick<ProtectiveBoundary, 'severity' | 'lastConfirmed' | 'expiresAt'>>): Promise<void>;
/**
 * Remove a boundary (user says it's okay now).
 */
export declare function removeBoundary(userId: string, boundaryId: string): Promise<void>;
/**
 * Load all active boundaries.
 */
export declare function loadBoundaries(userId: string): Promise<ProtectiveBoundary[]>;
/**
 * Check if a message/topic crosses any boundaries.
 */
export declare function checkBoundaries(text: string, boundaries: ProtectiveBoundary[]): BoundaryCheckResult;
/**
 * Detect boundaries from conversation patterns.
 * Call this when user shows signs of discomfort.
 */
export declare function inferBoundaryFromReaction(userId: string, topic: string, reactionType: 'deflected' | 'went_silent' | 'changed_subject' | 'showed_distress', context?: string): Promise<void>;
/**
 * Build context for LLM injection.
 */
export declare function buildProtectiveSilenceContext(userId: string): Promise<string>;
/**
 * Quick check if a response would cross boundaries.
 */
export declare function checkResponseSafety(userId: string, proposedResponse: string): Promise<BoundaryCheckResult>;
export declare const protectiveSilence: {
    record: typeof recordBoundary;
    update: typeof updateBoundary;
    remove: typeof removeBoundary;
    load: typeof loadBoundaries;
    check: typeof checkBoundaries;
    inferFromReaction: typeof inferBoundaryFromReaction;
    checkResponseSafety: typeof checkResponseSafety;
    buildContext: typeof buildProtectiveSilenceContext;
};
//# sourceMappingURL=protective-silence.d.ts.map