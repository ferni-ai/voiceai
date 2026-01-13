/**
 * Curiosity Memory - Follow Through on Passing Mentions
 *
 * "You mentioned your friend Sam a few weeks ago. How are they?"
 *
 * Philosophy: Real friends remember the small things. When someone
 * casually mentions a person, place, event, or activity, a good friend
 * files it away and asks about it later. This is one of the most
 * human-feeling capabilities.
 *
 * What we track:
 * - People mentioned (friends, family, colleagues)
 * - Places mentioned (vacation spots, hometown, new apartment)
 * - Events mentioned (weddings, concerts, deadlines)
 * - Activities mentioned (learning guitar, training for marathon)
 * - Goals mentioned (saving for house, getting promoted)
 *
 * When to follow up:
 * - 1-4 weeks after mention (sweet spot for "remembered")
 * - When the topic comes up naturally
 * - At session start if high priority
 *
 * @module CuriosityMemory
 */
export type MentionType = 'person' | 'place' | 'event' | 'activity' | 'goal' | 'object' | 'media';
export interface PassingMention {
    id: string;
    userId: string;
    personaId: string;
    /** What type of thing was mentioned */
    type: MentionType;
    /** The name or identifier of the thing */
    name: string;
    /** Additional context about the mention */
    context: string;
    /** The original quote if available */
    originalQuote?: string;
    /** How important is following up? */
    followUpPriority: 'high' | 'medium' | 'low';
    /** Why we might want to follow up */
    followUpReason?: string;
    /** When this was mentioned */
    mentionedAt: Date;
    /** Session ID where this was mentioned */
    sessionId: string;
    /** Has this been followed up on? */
    followedUpAt?: Date;
    /** How many times has this been mentioned? */
    mentionCount: number;
    /** Related topics/themes */
    relatedTopics?: string[];
    /** Emotional context when mentioned */
    emotionalContext?: 'positive' | 'negative' | 'neutral' | 'mixed';
    /** Is this time-sensitive? */
    timeSensitive?: boolean;
    /** Expected date if applicable (e.g., wedding date, deadline) */
    expectedDate?: Date;
}
export interface FollowUpOpportunity {
    mention: PassingMention;
    phrase: string;
    ssml: string;
    urgency: 'immediate' | 'soon' | 'whenever';
    reason: string;
}
export interface CuriosityProfile {
    userId: string;
    mentions: PassingMention[];
    lastUpdated: Date;
    /** Topics user has shown they like discussing */
    favoriteTopics: string[];
    /** People they mention frequently */
    frequentPeople: string[];
}
/**
 * Record a passing mention from the user.
 * Call this during turn processing when mentions are detected.
 */
export declare function recordPassingMention(params: {
    userId: string;
    personaId: string;
    type: MentionType;
    name: string;
    context: string;
    originalQuote?: string;
    sessionId: string;
    emotionalContext?: 'positive' | 'negative' | 'neutral' | 'mixed';
    expectedDate?: Date;
    relatedTopics?: string[];
}): PassingMention;
/**
 * Get a follow-up opportunity to use in conversation.
 * Returns null if nothing appropriate to follow up on.
 */
export declare function getFollowUpOpportunity(userId: string, currentTopic?: string): FollowUpOpportunity | null;
/**
 * Mark a mention as followed up
 */
export declare function markFollowedUp(mentionId: string): void;
/**
 * Clear session state
 */
export declare function clearSessionState(): void;
/**
 * Detect if the user's message contains a passing mention worth tracking.
 */
export declare function detectPassingMentions(params: {
    userText: string;
    currentTopic?: string;
    emotion?: string;
}): Array<{
    type: MentionType;
    name: string;
    context: string;
    quote?: string;
    emotionalContext?: 'positive' | 'negative' | 'neutral' | 'mixed';
    expectedDate?: Date;
}>;
export declare function loadCuriosityProfile(userId: string, data: CuriosityProfile): void;
export declare function getCuriosityProfileForPersistence(userId: string): CuriosityProfile | null;
export declare function getAllUnfollowedMentions(userId: string): PassingMention[];
export declare function getMentionsByType(userId: string, type: MentionType): PassingMention[];
/**
 * Clear all mentions for a user (for testing)
 */
export declare function clearUserMentions(userId: string): void;
declare const _default: {
    recordPassingMention: typeof recordPassingMention;
    getFollowUpOpportunity: typeof getFollowUpOpportunity;
    markFollowedUp: typeof markFollowedUp;
    markAsFollowedUp: typeof markFollowedUp;
    clearSessionState: typeof clearSessionState;
    detectPassingMentions: typeof detectPassingMentions;
    loadCuriosityProfile: typeof loadCuriosityProfile;
    getCuriosityProfileForPersistence: typeof getCuriosityProfileForPersistence;
    getAllUnfollowedMentions: typeof getAllUnfollowedMentions;
    getMentionsByType: typeof getMentionsByType;
    clearUserMentions: typeof clearUserMentions;
};
export default _default;
//# sourceMappingURL=curiosity-memory.d.ts.map