/**
 * Contact Relationship Service
 *
 * Tracks relationship context for contacts:
 * - Last interaction date
 * - Relationship strength score
 * - Communication patterns
 * - Key topics/interests
 * - Follow-up reminders
 *
 * This enables Alex to provide intelligent relationship insights like:
 * - "You haven't talked to Sarah in 3 weeks"
 * - "John usually responds within 24 hours"
 * - "Last time you spoke with Mom, she mentioned her knee surgery"
 *
 * @module services/contacts
 */
export interface ContactRelationship {
    id: string;
    userId: string;
    contactId: string;
    name: string;
    email?: string;
    phone?: string;
    relationship?: 'family' | 'friend' | 'colleague' | 'acquaintance' | 'professional' | 'other';
    notes?: string;
    firstInteraction: Date;
    lastInteraction: Date;
    interactionCount: number;
    strengthScore: number;
    avgResponseTimeHours?: number;
    preferredChannel?: 'email' | 'phone' | 'text' | 'in-person';
    bestTimeToReach?: string;
    topics: ContactTopic[];
    recentContext: string[];
    importantDates?: Array<{
        date: string;
        type: 'birthday' | 'anniversary' | 'memorial' | 'custom';
        label?: string;
    }>;
    pendingFollowUp?: FollowUpReminder;
    lastFollowUpDate?: Date;
    createdAt: Date;
    updatedAt: Date;
}
export interface ContactTopic {
    topic: string;
    firstMentioned: Date;
    lastMentioned: Date;
    mentionCount: number;
    sentiment?: 'positive' | 'neutral' | 'negative';
}
export interface FollowUpReminder {
    reason: string;
    dueDate: Date;
    priority: 'high' | 'medium' | 'low';
    completed: boolean;
}
/**
 * Comprehensive interaction types for "Better Than Human" tracking
 *
 * We track EVERYTHING - no human can remember all this!
 */
export type InteractionType = 'email' | 'call' | 'text' | 'video_call' | 'voice_message' | 'instant_message' | 'social_like' | 'social_comment' | 'social_dm' | 'social_tag' | 'social_share' | 'meeting' | 'hangout' | 'dinner' | 'party' | 'activity' | 'trip' | 'visit' | 'gift_given' | 'gift_received' | 'card_sent' | 'card_received' | 'thank_you_sent' | 'thank_you_received' | 'money_lent' | 'money_borrowed' | 'money_repaid' | 'split_bill' | 'attended_event' | 'milestone_shared' | 'photo_shared' | 'recommendation' | 'introduction' | 'favor_done' | 'favor_received' | 'other';
export interface InteractionRecord {
    id: string;
    contactId: string;
    userId: string;
    date: Date;
    type: InteractionType;
    direction: 'inbound' | 'outbound' | 'mutual';
    summary?: string;
    topics?: string[];
    sentiment?: 'positive' | 'neutral' | 'negative';
    responseTimeHours?: number;
    duration?: number;
    location?: string;
    platform?: string;
    mediaUrl?: string;
    amount?: number;
    linkedGiftId?: string;
    participantNames?: string[];
    isStreak?: boolean;
    streakCount?: number;
}
export interface ContactInsight {
    contactId: string;
    contactName: string;
    insightType: 'overdue' | 'strengthening' | 'weakening' | 'follow-up' | 'pattern';
    message: string;
    priority: 'high' | 'medium' | 'low';
    suggestedAction?: string;
}
/**
 * Get all contacts for a user
 */
export declare function getContacts(userId: string): Promise<ContactRelationship[]>;
/**
 * Get a specific contact by ID or email
 */
export declare function getContact(userId: string, identifier: string): Promise<ContactRelationship | null>;
/**
 * Create or update a contact
 */
export declare function upsertContact(userId: string, contact: Partial<ContactRelationship> & {
    name: string;
    contactId: string;
}): Promise<ContactRelationship>;
/**
 * Record an interaction with a contact
 *
 * "Better Than Human" - We track EVERYTHING and detect patterns
 */
export declare function recordInteraction(userId: string, interaction: Omit<InteractionRecord, 'id'>): Promise<InteractionRecord>;
/**
 * Set a follow-up reminder for a contact
 */
export declare function setFollowUp(userId: string, contactId: string, followUp: Omit<FollowUpReminder, 'completed'>): Promise<void>;
/**
 * Complete a follow-up
 */
export declare function completeFollowUp(userId: string, contactId: string): Promise<void>;
/**
 * Get relationship insights for a user
 */
export declare function getRelationshipInsights(userId: string): Promise<ContactInsight[]>;
/**
 * Get contacts that need attention
 */
export declare function getContactsNeedingAttention(userId: string, limit?: number): Promise<ContactRelationship[]>;
/**
 * Search contacts by name, topic, or relationship alias
 *
 * 🐛 FIX: Also searches the main contacts service (user_contacts collection)
 * as a fallback, since data capture saves contacts there but telephony
 * was only looking in contact_relationships.
 */
export declare function searchContacts(userId: string, query: string): Promise<ContactRelationship[]>;
/**
 * Get context for a contact (for LLM)
 */
export declare function getContactContext(userId: string, contactId: string): Promise<string | null>;
/**
 * Get full interaction history for a contact
 */
export declare function getInteractionHistory(userId: string, contactId: string, options?: {
    limit?: number;
    type?: InteractionType;
    since?: Date;
}): Promise<InteractionRecord[]>;
/**
 * Get interaction statistics for a contact
 *
 * "Better Than Human" - Perfect pattern recognition
 */
export declare function getInteractionStats(userId: string, contactId: string): Promise<{
    totalInteractions: number;
    byType: Record<string, number>;
    avgPerMonth: number;
    longestStreak: {
        type: InteractionType;
        count: number;
    } | null;
    lastByType: Record<string, Date>;
    sentimentTrend: 'improving' | 'stable' | 'declining' | 'unknown';
    suggestedNextInteraction: InteractionType;
}>;
/**
 * Get conversation topics to bring up
 *
 * "Better Than Human" - Perfect recall of what they care about
 */
export declare function getTopicsToDiscuss(userId: string, contactId: string): Promise<Array<{
    topic: string;
    lastDiscussed: Date;
    sentiment: string;
    suggestion: string;
}>>;
export declare function clearCache(userId?: string): void;
declare const _default: {
    getContacts: typeof getContacts;
    getContact: typeof getContact;
    upsertContact: typeof upsertContact;
    recordInteraction: typeof recordInteraction;
    setFollowUp: typeof setFollowUp;
    completeFollowUp: typeof completeFollowUp;
    getRelationshipInsights: typeof getRelationshipInsights;
    getContactsNeedingAttention: typeof getContactsNeedingAttention;
    searchContacts: typeof searchContacts;
    getContactContext: typeof getContactContext;
    getInteractionHistory: typeof getInteractionHistory;
    getInteractionStats: typeof getInteractionStats;
    getTopicsToDiscuss: typeof getTopicsToDiscuss;
    clearCache: typeof clearCache;
};
export default _default;
//# sourceMappingURL=contact-relationship-service.d.ts.map