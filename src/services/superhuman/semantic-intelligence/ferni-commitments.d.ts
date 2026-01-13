/**
 * Ferni Commitments - Proactive Intelligence V3.2
 *
 * Tracks Ferni's promises to users:
 * - "I'll check in about that"
 * - "Let's revisit this next time"
 * - "I won't bring that up again"
 * - "I'll remember that"
 *
 * This ensures Ferni keeps her promises - a key trust builder.
 *
 * @module services/superhuman/semantic-intelligence/ferni-commitments
 */
export type CommitmentType = 'check_in' | 'revisit' | 'remember' | 'avoid' | 'follow_up' | 'research' | 'celebrate';
export interface FerniCommitment {
    id: string;
    userId: string;
    type: CommitmentType;
    commitment: string;
    context: string;
    madeAt: Date;
    dueBy?: Date;
    fulfilled: boolean;
    fulfilledAt?: Date;
    fulfilledHow?: string;
    violated?: boolean;
    violatedAt?: Date;
    relatedTopic?: string;
    relatedPerson?: string;
}
/**
 * Create a new Ferni commitment.
 */
export declare function createCommitment(userId: string, commitment: {
    type: CommitmentType;
    commitment: string;
    context: string;
    dueBy?: Date;
    relatedTopic?: string;
    relatedPerson?: string;
}): Promise<FerniCommitment>;
/**
 * Mark a commitment as fulfilled.
 */
export declare function fulfillCommitment(userId: string, commitmentId: string, how?: string): Promise<void>;
/**
 * Check if Ferni violated an avoidance commitment.
 */
export declare function checkAvoidanceViolation(userId: string, topic: string): Promise<FerniCommitment | null>;
/**
 * Get pending commitments that need to be fulfilled.
 */
export declare function getPendingCommitments(userId: string): Promise<FerniCommitment[]>;
/**
 * Get "remember" commitments (things Ferni should know).
 */
export declare function getRememberedThings(userId: string): Promise<FerniCommitment[]>;
/**
 * Get topics to avoid.
 */
export declare function getAvoidanceTopics(userId: string): Promise<string[]>;
/**
 * Get all commitments for a user.
 */
export declare function getAllCommitments(userId: string): Promise<FerniCommitment[]>;
/**
 * Detect commitments in Ferni's response.
 */
export declare function detectCommitmentsInResponse(responseText: string): Array<{
    type: CommitmentType;
    commitment: string;
    matchedText: string;
}>;
/**
 * Process Ferni's response and create commitments.
 */
export declare function trackCommitmentsInResponse(userId: string, responseText: string, context: {
    topic?: string;
    person?: string;
    userMessage?: string;
}): Promise<FerniCommitment[]>;
/**
 * Format commitments for LLM context injection.
 */
export declare function formatCommitmentsForContext(commitments: FerniCommitment[], avoidanceTopics: string[]): string;
export declare function clearCommitmentCache(userId?: string): void;
export declare const ferniCommitments: {
    create: typeof createCommitment;
    fulfill: typeof fulfillCommitment;
    checkAvoidance: typeof checkAvoidanceViolation;
    getPending: typeof getPendingCommitments;
    getRemembered: typeof getRememberedThings;
    getAvoidanceTopics: typeof getAvoidanceTopics;
    getAll: typeof getAllCommitments;
    detectInResponse: typeof detectCommitmentsInResponse;
    trackInResponse: typeof trackCommitmentsInResponse;
    format: typeof formatCommitmentsForContext;
    clearCache: typeof clearCommitmentCache;
};
export default ferniCommitments;
//# sourceMappingURL=ferni-commitments.d.ts.map