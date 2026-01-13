/**
 * Gift Tracking & Suggestion Service
 *
 * "Better Than Human" - Never forget a gift. Never repeat one.
 * Track gifts given/received and get AI-powered suggestions based on
 * the person's interests, past gifts, and relationship context.
 *
 * @module services/contacts/gift-tracking-service
 */
export interface Gift {
    id: string;
    userId: string;
    contactId: string;
    contactName: string;
    direction: 'given' | 'received';
    item: string;
    description?: string;
    occasion: string;
    date: Date;
    price?: number;
    reaction?: 'loved' | 'liked' | 'neutral' | 'disliked';
    notes?: string;
    tags?: string[];
    imageUrl?: string;
}
export interface GiftSuggestion {
    idea: string;
    description: string;
    priceRange: string;
    confidence: 'high' | 'medium' | 'low';
    reasoning: string;
    tags: string[];
    avoidReason?: string;
}
export interface GiftHistory {
    given: Gift[];
    received: Gift[];
    patterns: {
        favoriteCategories: string[];
        averageSpending: number;
        preferredOccasions: string[];
    };
}
export declare function clearGiftCache(): void;
/**
 * Record a gift given or received
 *
 * "Better Than Human" Integration:
 * - Saves to Firestore for persistence
 * - Automatically records an interaction
 * - Updates relationship context
 */
export declare function recordGift(userId: string, gift: Omit<Gift, 'id' | 'userId'>): Promise<Gift>;
/**
 * Get gift history for a contact
 */
export declare function getGiftHistory(userId: string, contactId: string): Promise<GiftHistory>;
/**
 * Get all gifts for a user
 * Loads from Firestore if not in cache
 */
export declare function getAllGifts(userId: string): Promise<Gift[]>;
/**
 * Update gift reaction
 */
export declare function updateGiftReaction(userId: string, giftId: string, reaction: Gift['reaction']): Promise<Gift | null>;
/**
 * Generate personalized gift suggestions using LLM
 */
export declare function generateGiftSuggestions(userId: string, contactId: string, occasion: string, budget?: {
    min: number;
    max: number;
}): Promise<GiftSuggestion[]>;
export interface GiftReminder {
    contactId: string;
    contactName: string;
    occasion: string;
    date: Date;
    daysUntil: number;
    suggestedBudget?: number;
    lastGiftGiven?: Gift;
}
/**
 * Get upcoming gift occasions
 */
export declare function getUpcomingGiftOccasions(userId: string, daysAhead?: number): Promise<GiftReminder[]>;
export interface GiftAnalytics {
    totalGiven: number;
    totalReceived: number;
    totalSpent: number;
    averagePerGift: number;
    topRecipients: Array<{
        name: string;
        count: number;
    }>;
    popularCategories: Array<{
        category: string;
        count: number;
    }>;
    reactionBreakdown: Record<string, number>;
}
/**
 * Get gift analytics for a user
 */
export declare function getGiftAnalytics(userId: string): Promise<GiftAnalytics>;
//# sourceMappingURL=gift-tracking-service.d.ts.map