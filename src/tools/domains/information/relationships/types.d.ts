/**
 * Relationship Intelligence Types
 *
 * Type definitions for "Better Than Human" relationship tracking.
 * Enables features like:
 * - Birthday reminders
 * - "Your friend's team won!"
 * - "You haven't caught up with [person] in a while"
 * - Gift suggestions based on interests
 */
/**
 * A relationship/contact in the user's network
 */
export interface Relationship {
    /** Unique identifier */
    id: string;
    /** Person's name */
    name: string;
    /** Optional nickname */
    nickname?: string;
    /** Relationship type */
    relationshipType: RelationshipType;
    /** Birthday (month/day) */
    birthday?: {
        month: number;
        day: number;
    };
    /** Anniversary with user */
    anniversary?: {
        month: number;
        day: number;
        year?: number;
        type: 'wedding' | 'dating' | 'friendship' | 'work' | 'other';
    };
    /** Interests and preferences */
    interests: string[];
    /** Favorite sports teams */
    favoriteTeams: string[];
    /** Communication preferences */
    preferredContactMethod?: 'call' | 'text' | 'email' | 'in-person';
    /** Last meaningful contact date */
    lastContact?: Date;
    /** Target contact frequency in days */
    targetContactFrequency?: number;
    /** Notes about the relationship */
    notes?: string;
    /** Important dates/events */
    importantDates?: ImportantDate[];
    /** Gift history */
    giftHistory?: GiftRecord[];
    /** When this relationship was added */
    createdAt: Date;
    /** Last updated */
    updatedAt: Date;
}
export type RelationshipType = 'family_parent' | 'family_sibling' | 'family_child' | 'family_extended' | 'spouse' | 'partner' | 'friend_close' | 'friend' | 'friend_acquaintance' | 'colleague' | 'mentor' | 'mentee' | 'other';
/**
 * Important date for a relationship
 */
export interface ImportantDate {
    id: string;
    date: {
        month: number;
        day: number;
        year?: number;
    };
    type: 'birthday' | 'anniversary' | 'graduation' | 'achievement' | 'memorial' | 'other';
    description: string;
    recurring: boolean;
}
/**
 * Gift history record
 */
export interface GiftRecord {
    id: string;
    date: Date;
    occasion: string;
    gift: string;
    notes?: string;
    reaction?: 'loved_it' | 'liked_it' | 'neutral' | 'not_great';
}
/**
 * A relationship-based insight
 */
export interface RelationshipInsight {
    /** Unique identifier */
    id: string;
    /** Type of insight */
    type: RelationshipInsightType;
    /** Related relationship */
    relationshipId: string;
    /** Person's name */
    personName: string;
    /** Human-readable message */
    message: string;
    /** Suggested action */
    suggestion?: string;
    /** Priority (higher = more important) */
    priority: number;
    /** When this insight was generated */
    generatedAt: Date;
    /** When this insight expires */
    expiresAt: Date;
    /** Additional context */
    context: Record<string, unknown>;
}
export type RelationshipInsightType = 'birthday_upcoming' | 'birthday_today' | 'anniversary_upcoming' | 'anniversary_today' | 'team_won' | 'team_lost' | 'team_playing' | 'havent_talked' | 'shared_interest_news' | 'gift_suggestion' | 'special_day';
/**
 * Birthday reminder configuration
 */
export interface BirthdayReminder {
    /** Days before birthday to start reminding */
    daysBeforeAlert: number[];
    /** Include gift suggestions */
    includeGiftSuggestions: boolean;
    /** Message templates */
    messageTemplates: {
        upcoming: string[];
        today: string[];
        missed: string[];
    };
}
export declare const DEFAULT_BIRTHDAY_REMINDER: BirthdayReminder;
/**
 * Sports team update for relationships
 */
export interface RelationshipTeamUpdate {
    relationshipId: string;
    personName: string;
    teamName: string;
    updateType: 'won' | 'lost' | 'playing_soon' | 'playing_now';
    gameDetails?: string;
    score?: string;
    opponent?: string;
}
/**
 * Message templates for team updates
 */
export declare const TEAM_UPDATE_MESSAGES: {
    won: string[];
    lost: string[];
    playing_soon: string[];
    playing_now: string[];
};
/**
 * Contact frequency recommendation
 */
export interface ContactFrequencyConfig {
    relationshipType: RelationshipType;
    recommendedDays: number;
    gentleReminderDays: number;
    urgentReminderDays: number;
}
export declare const DEFAULT_CONTACT_FREQUENCIES: ContactFrequencyConfig[];
/**
 * Gift suggestion based on interests
 */
export interface GiftSuggestion {
    category: string;
    suggestion: string;
    reason: string;
    priceRange: 'budget' | 'moderate' | 'premium' | 'any';
}
/**
 * Interest to gift mapping
 */
export declare const INTEREST_GIFT_MAPPINGS: Record<string, GiftSuggestion[]>;
/**
 * Generic gift suggestions for when interests are unknown
 */
export declare const GENERIC_GIFT_SUGGESTIONS: GiftSuggestion[];
//# sourceMappingURL=types.d.ts.map