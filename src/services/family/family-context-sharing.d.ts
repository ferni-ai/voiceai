/**
 * Family Context Sharing Service
 *
 * Manages what context can be shared between family members and sponsors.
 * Implements privacy boundaries and explicit sharing controls.
 *
 * PRIVACY PRINCIPLES:
 * - Specific conversation content is NEVER shared unless explicitly requested
 * - Only aggregate emotional patterns can be shared
 * - Explicit "share with X" requests are honored
 * - Health details beyond general wellness stay private
 *
 * @module services/family/family-context-sharing
 */
/**
 * Types of shareable context between family members.
 */
export type ShareableContextType = 'emotional_state' | 'explicit_share' | 'milestone' | 'check_in_request' | 'thinking_of_you';
/**
 * A shareable context item between family members.
 */
export interface ShareableContext {
    id: string;
    type: ShareableContextType;
    /** Who generated this context (their familyUserId or userId) */
    fromUserId: string;
    /** Display name of source */
    fromName: string;
    /** Relationship of source */
    fromRelationship: string;
    /** Who should receive this context */
    toUserId: string;
    /** Summary content (privacy-safe) */
    summary: string;
    /** When this context was created */
    createdAt: Date;
    /** When this context expires (auto-cleanup) */
    expiresAt: Date;
    /** Whether this context has been delivered */
    delivered: boolean;
    /** Session ID where context was generated */
    sourceSessionId?: string;
}
/**
 * Emotional state summary (privacy-safe aggregate).
 */
export interface EmotionalStateSummary {
    /** General emotional valence: positive, neutral, negative, mixed */
    valence: 'positive' | 'neutral' | 'negative' | 'mixed';
    /** Brief, safe description */
    description: string;
    /** Last conversation timestamp */
    lastConversationAt: Date;
    /** Any notable topics (only non-sensitive) */
    notableTopics?: string[];
}
/**
 * Create shareable context from one family member to another.
 * Enforces privacy boundaries automatically.
 */
export declare function createShareableContext(params: {
    type: ShareableContextType;
    fromUserId: string;
    fromName: string;
    fromRelationship: string;
    toUserId: string;
    summary: string;
    sourceSessionId?: string;
}): Promise<ShareableContext | null>;
/**
 * Create an explicit share request (user specifically asked to share something).
 */
export declare function createExplicitShare(params: {
    fromUserId: string;
    fromName: string;
    fromRelationship: string;
    toUserId: string;
    message: string;
    sourceSessionId?: string;
}): Promise<ShareableContext | null>;
/**
 * Create a check-in request (one family member asked Ferni to check on another).
 */
export declare function createCheckInRequest(params: {
    fromUserId: string;
    fromName: string;
    fromRelationship: string;
    toUserId: string;
    reason?: string;
    sourceSessionId?: string;
}): Promise<ShareableContext | null>;
/**
 * Create a "thinking of you" context (mentioned they're thinking of the other person).
 */
export declare function createThinkingOfYouContext(params: {
    fromUserId: string;
    fromName: string;
    fromRelationship: string;
    toUserId: string;
    sourceSessionId?: string;
}): Promise<ShareableContext | null>;
/**
 * Get pending shareable contexts for a user.
 * Returns contexts that haven't been delivered yet.
 */
export declare function getPendingContexts(userId: string): Promise<ShareableContext[]>;
/**
 * Mark contexts as delivered.
 */
export declare function markContextsDelivered(ids: string[]): Promise<void>;
/**
 * Get a privacy-safe emotional state summary for a user.
 * This is the only emotional data that can be shared.
 */
export declare function getEmotionalStateSummary(userId: string): Promise<EmotionalStateSummary | null>;
/**
 * Clean up expired contexts.
 */
export declare function cleanupExpiredContexts(): Promise<number>;
//# sourceMappingURL=family-context-sharing.d.ts.map