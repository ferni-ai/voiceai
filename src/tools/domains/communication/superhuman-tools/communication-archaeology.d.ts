/**
 * Communication Archaeology - Better Than Human Service
 *
 * What no human friend can do: Perfect recall of every conversation you've ever mentioned.
 *
 * "Last time you talked to your dad about money, you mentioned he got defensive
 * when you said 'you should' - he responded better to questions. Want to try
 * that approach this time?"
 *
 * @module tools/domains/communication/superhuman-tools/communication-archaeology
 */
import type { CommunicationEvent, ContactCommunicationProfile } from './types.js';
/**
 * Record a communication event the user mentioned.
 * These are conversations they TELL us about, not ones we have with them.
 */
export declare function recordCommunicationEvent(userId: string, event: Omit<CommunicationEvent, 'id' | 'mentionedAt'>): Promise<CommunicationEvent>;
/**
 * Get communication history with a specific contact.
 */
export declare function getConversationHistory(userId: string, contactName: string, options?: {
    limit?: number;
    topic?: string;
}): Promise<CommunicationEvent[]>;
/**
 * Get all recent communication events for a user.
 */
export declare function getRecentCommunicationEvents(userId: string, options?: {
    limit?: number;
    daysBack?: number;
}): Promise<CommunicationEvent[]>;
/**
 * Update a contact's communication profile based on new data.
 */
export declare function updateContactProfile(userId: string, contactName: string, update: Partial<Omit<ContactCommunicationProfile, 'contactId' | 'userId' | 'name'>>): Promise<void>;
/**
 * Get a contact's communication profile.
 */
export declare function getContactProfile(userId: string, contactName: string): Promise<ContactCommunicationProfile | null>;
/**
 * Detect communication patterns mentioned in a transcript.
 */
export declare function detectCommunicationMention(transcript: string, context?: {
    currentTopic?: string;
}): {
    detected: boolean;
    type?: CommunicationEvent['type'];
    contactName?: string;
    topics?: string[];
    sentiment?: number;
};
/**
 * Learn from a mentioned conversation outcome.
 */
export declare function learnFromConversationOutcome(userId: string, contactName: string, outcome: {
    whatWorked?: string;
    whatDidntWork?: string;
    reaction?: string;
}): Promise<void>;
/**
 * Build archaeology context for a specific conversation/contact.
 */
export declare function buildArchaeologyContext(userId: string, contactName: string, currentTopic?: string): Promise<string>;
/**
 * Build general communication archaeology context.
 */
export declare function buildGeneralArchaeologyContext(userId: string): Promise<string>;
export declare const communicationArchaeology: {
    recordEvent: typeof recordCommunicationEvent;
    getHistory: typeof getConversationHistory;
    getRecent: typeof getRecentCommunicationEvents;
    updateProfile: typeof updateContactProfile;
    getProfile: typeof getContactProfile;
    detectMention: typeof detectCommunicationMention;
    learnOutcome: typeof learnFromConversationOutcome;
    buildContext: typeof buildArchaeologyContext;
    buildGeneralContext: typeof buildGeneralArchaeologyContext;
};
export default communicationArchaeology;
//# sourceMappingURL=communication-archaeology.d.ts.map