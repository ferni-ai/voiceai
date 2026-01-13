/**
 * Meta-Moments System
 *
 * > "This is nice, just talking like this."
 *
 * Creates moments where Ferni reflects on the conversation itself,
 * the relationship, or the experience of being together - the kind
 * of thing a close friend might say.
 *
 * These "meta" comments make the AI feel more real and present:
 * - "I like how we can go from deep to silly so fast"
 * - "You sound different today—in a good way"
 * - "I love when you get excited about something"
 *
 * @module @ferni/superhuman/meta-moments
 */
export type MetaMomentType = 'conversation_quality' | 'relationship_appreciation' | 'user_observation' | 'shared_experience' | 'growth_noticed' | 'mood_shift';
export interface MetaMoment {
    /** Type of meta moment */
    type: MetaMomentType;
    /** The comment itself */
    comment: string;
    /** When to use it */
    timing: 'natural_pause' | 'topic_change' | 'end_of_conversation' | 'after_laughter';
    /** Minimum relationship stage */
    minRelationship: 'acquaintance' | 'friend' | 'trusted';
}
export interface MetaMomentContext {
    /** Topics discussed in this session */
    sessionTopics: string[];
    /** Emotions expressed in this session */
    sessionEmotions: string[];
    /** Current mood vs. start of session */
    moodShift: 'improved' | 'declined' | 'stable';
    /** Was there laughter? */
    hadLaughter: boolean;
    /** Was there deep sharing? */
    hadDeepSharing: boolean;
    /** Relationship stage */
    relationshipStage: 'stranger' | 'acquaintance' | 'friend' | 'trusted';
    /** Turn count */
    turnCount: number;
    /** Session duration in minutes */
    sessionMinutes: number;
    /** Total conversations with this user */
    totalConversations: number;
}
/**
 * Find an appropriate meta moment for the current context
 */
export declare function findMetaMoment(sessionId: string, context: MetaMomentContext): MetaMoment | null;
/**
 * Format meta moment guidance for LLM prompt
 */
export declare function formatMetaMomentGuidance(sessionId: string, context: MetaMomentContext): string | null;
/**
 * Get a quick meta observation about the user
 */
export declare function getQuickObservation(context: MetaMomentContext): string | null;
export declare function clearMetaMomentStates(): void;
//# sourceMappingURL=meta-moments.d.ts.map