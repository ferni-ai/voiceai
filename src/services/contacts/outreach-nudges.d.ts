/**
 * Proactive Outreach Nudges
 *
 * "Better Than Human" proactive outreach that surfaces opportunities:
 * - Upcoming birthdays, anniversaries, memorials
 * - People you communicate with frequently
 * - Seasonal/holiday opportunities
 * - Contacts that need attention (haven't talked in a while)
 *
 * Ferni uses these nudges to naturally suggest outreach:
 * "Hey, your mom's birthday is in 3 days. Want me to send her something?"
 *
 * @module services/contacts/outreach-nudges
 */
import type { OutreachOccasion, ChannelType } from './types.js';
export type NudgeType = 'upcoming_birthday' | 'upcoming_anniversary' | 'upcoming_memorial' | 'holiday_opportunity' | 'frequent_contact' | 'needs_attention' | 'check_in';
export type NudgePriority = 'high' | 'medium' | 'low';
export interface OutreachNudge {
    id: string;
    type: NudgeType;
    priority: NudgePriority;
    contactId: string;
    contactName: string;
    relationship: string;
    reason: string;
    daysUntilEvent?: number;
    suggestedChannel: ChannelType;
    suggestedOccasion: OutreachOccasion;
    suggestedMessage?: string;
    bestTimeToSend?: string;
    expiresAt: Date;
    context: {
        recentTopics?: string[];
        sharedMemories?: string[];
        theirInterests?: string[];
    };
}
export interface NudgeContext {
    /** Current nudges ready to surface */
    nudges: OutreachNudge[];
    /** Summary for Ferni's context */
    summary: string;
    /** Upcoming dates in the next 2 weeks */
    upcomingDates: Array<{
        contactName: string;
        dateType: string;
        date: string;
        daysAway: number;
    }>;
    /** Contacts that could use attention */
    needsAttention: Array<{
        contactName: string;
        daysSinceContact: number;
        relationship: string;
    }>;
    /** Holiday opportunities */
    upcomingHolidays: Array<{
        name: string;
        date: string;
        daysAway: number;
    }>;
}
/**
 * Generate all current outreach nudges for a user
 */
export declare function generateNudges(userId: string): Promise<OutreachNudge[]>;
/**
 * Build nudge context for Ferni to use in conversations
 * This gets injected into the system prompt or context
 */
export declare function buildNudgeContext(userId: string): Promise<NudgeContext>;
/**
 * Format a nudge as a natural suggestion from Ferni
 * This is what Ferni might say during a conversation
 */
export declare function formatNudgeAsSuggestion(nudge: OutreachNudge): string;
/**
 * Get the top nudge that Ferni should mention
 * Returns null if there's nothing urgent enough to mention
 */
export declare function getTopNudgeForMention(userId: string): Promise<{
    nudge: OutreachNudge;
    suggestion: string;
} | null>;
interface FrequentContactData {
    contactId: string;
    contactName: string;
    avgDaysBetweenContact: number;
    lastContactDate: Date;
    daysSinceLastContact: number;
    isOverdue: boolean;
}
/**
 * Identify contacts that the user communicates with frequently
 * but hasn't contacted recently
 */
export declare function getOverdueFrequentContacts(userId: string): Promise<FrequentContactData[]>;
export declare const outreachNudges: {
    generateNudges: typeof generateNudges;
    buildNudgeContext: typeof buildNudgeContext;
    formatNudgeAsSuggestion: typeof formatNudgeAsSuggestion;
    getTopNudgeForMention: typeof getTopNudgeForMention;
    getOverdueFrequentContacts: typeof getOverdueFrequentContacts;
};
export default outreachNudges;
//# sourceMappingURL=outreach-nudges.d.ts.map