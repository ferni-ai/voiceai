/**
 * Contact Management Types
 *
 * Types for the contact management system.
 * This file is at Level 10 (types layer) and can be imported by any layer.
 *
 * @module types/contacts
 */
/**
 * Communication channel types
 * - email: Email address
 * - phone: Phone calls
 * - sms/text: SMS text messages (sms and text are synonyms)
 * - in-person: In-person meetings
 */
export type ChannelType = 'email' | 'phone' | 'sms' | 'text' | 'in-person';
export interface ContactChannel {
    /** Channel type */
    type: ChannelType;
    /** Email address or phone number */
    value: string;
    /** Label for this channel (e.g., "work", "personal", "mobile") */
    label?: string;
    /** Whether this channel has been verified/used successfully */
    verified: boolean;
    /** Preference rank (1 = most preferred) */
    preferenceRank: number;
}
export type ImportantDateType = 'birthday' | 'anniversary' | 'memorial' | 'custom';
export type DateSentiment = 'celebratory' | 'reflective' | 'sensitive' | 'neutral';
export interface ContactImportantDate {
    /** Date in MM-DD format (recurring) or YYYY-MM-DD (specific) */
    date: string;
    /** Type of date */
    type: ImportantDateType;
    /** Human-readable label (e.g., "Birthday", "Wedding Anniversary") */
    label: string;
    /** Year of the event, if known (for calculating "Happy 40th!") */
    year?: number;
    /** Emotional tone for this date */
    sentiment: DateSentiment;
    /** Notes about how to acknowledge this date */
    notes?: string;
}
export type RelationshipType = 'family' | 'partner' | 'friend' | 'colleague' | 'acquaintance' | 'professional' | 'mentor' | 'mentee' | 'other';
export type RelationshipSentiment = 'warm' | 'neutral' | 'strained' | 'complicated';
export interface EnhancedContact {
    id: string;
    userId: string;
    name: string;
    aliases: string[];
    channels: ContactChannel[];
    preferredChannel: ChannelType;
    relationship: RelationshipType;
    groups: string[];
    importantDates: ContactImportantDate[];
    interests: string[];
    recentTopics: string[];
    sharedMemories: string[];
    sensitiveTopics: string[];
    lastContactDate: Date;
    lastContactMethod: ChannelType | null;
    avgResponseTimeHours?: number;
    preferredTimes?: string[];
    strengthScore: number;
    sentiment: RelationshipSentiment;
    needsAttention: boolean;
    interactionCount: number;
    firstInteractionDate: Date;
    createdAt: Date;
    updatedAt: Date;
    notes?: string;
}
export interface OccasionPreferences {
    /** Send Christmas/holiday greetings */
    christmas?: boolean;
    /** Send New Year greetings */
    newYear?: boolean;
    /** Send birthday wishes */
    birthdays?: boolean;
    /** Send Thanksgiving greetings */
    thanksgiving?: boolean;
    /** Send anniversary wishes */
    anniversaries?: boolean;
}
export interface ContactGroup {
    id: string;
    userId: string;
    /** Group name (e.g., "Family", "Close Friends", "Work Team") */
    name: string;
    /** Optional description */
    description?: string;
    /** Contact IDs in this group */
    members: string[];
    /** Default channel for group messages */
    defaultChannel?: ChannelType;
    /** Which occasions to send greetings for */
    occasionPreferences: OccasionPreferences;
    /** Metadata */
    createdAt: Date;
    updatedAt: Date;
}
export type OutreachOccasion = 'christmas' | 'new_year' | 'thanksgiving' | 'birthday' | 'anniversary' | 'memorial' | 'check_in' | 'thinking_of_you' | 'congratulations' | 'sympathy' | 'custom';
export type OutreachTone = 'casual' | 'warm' | 'formal' | 'celebratory' | 'supportive' | 'reflective';
export interface OutreachContext {
    /** The contact to reach out to */
    contact: EnhancedContact;
    /** Days since last contact */
    lastContactedDays: number;
    /** Recent topics discussed about this person */
    recentTopicsDiscussed: string[];
    /** Shared experiences to reference */
    sharedExperiences: string[];
    /** The occasion for this outreach */
    occasion: OutreachOccasion;
    /** Custom occasion name if occasion is 'custom' */
    customOccasion?: string;
    /** Upcoming important dates for this person */
    upcomingDates: ContactImportantDate[];
    /** Their interests to potentially reference */
    theirInterests: string[];
    /** Challenges they're facing (to show support) */
    theirChallenges: string[];
    /** Inside jokes or shared references */
    insideJokes: string[];
    /** How formal/casual the message should be */
    tone: OutreachTone;
}
export interface PersonalizedMessage {
    /** Contact this message is for */
    contactId: string;
    contactName: string;
    /** The generated message */
    message: string;
    /** Channel to send through */
    channel: ChannelType;
    channelValue: string;
    /** Occasion this is for */
    occasion: OutreachOccasion;
    /** Personalization elements used */
    personalizationNotes: string[];
    /** Whether user has approved this message */
    approved: boolean;
    /** Whether this has been sent */
    sent: boolean;
    sentAt?: Date;
}
export interface BatchOutreachRequest {
    /** User making the request */
    userId: string;
    /** Group ID or array of contact IDs */
    recipients: string | string[];
    /** The occasion */
    occasion: OutreachOccasion;
    customOccasion?: string;
    /** Desired tone */
    tone: OutreachTone;
    /** Optional base message to personalize from */
    baseMessage?: string;
    /** Whether to auto-send or require approval */
    requireApproval: boolean;
}
export interface BatchOutreachResult {
    /** Request ID for tracking */
    requestId: string;
    /** Generated messages */
    messages: PersonalizedMessage[];
    /** Any contacts that couldn't be messaged (no channel, etc.) */
    skipped: Array<{
        contactId: string;
        contactName: string;
        reason: string;
    }>;
    /** Summary stats */
    stats: {
        total: number;
        generated: number;
        skipped: number;
        sent: number;
    };
}
export type SuggestionType = 'overdue' | 'upcoming_date' | 'check_in' | 'seasonal' | 'life_event';
export interface OutreachSuggestion {
    type: SuggestionType;
    contact: EnhancedContact;
    reason: string;
    suggestedMessage?: string;
    urgency: 'low' | 'medium' | 'high';
    daysUntilStale: number;
}
export type BudgetRange = 'thoughtful' | 'moderate' | 'generous' | 'splurge';
//# sourceMappingURL=contacts.d.ts.map