/**
 * Relationship Network Map - Better Than Human Service
 *
 * What no human friend can do: Remember everyone in your life perfectly.
 *
 * Maps the user's social ecosystem: key people, relationship dynamics,
 * mention frequency, and opportunities for connection or boundary-setting.
 *
 * @module services/superhuman/relationship-network
 */
export type RelationshipType = 'family' | 'partner' | 'friend' | 'colleague' | 'acquaintance' | 'mentor' | 'mentee' | 'ex' | 'complicated';
export type RelationshipSentiment = 'very_positive' | 'positive' | 'neutral' | 'tense' | 'negative' | 'complicated' | 'healing';
export interface RelationshipPerson {
    id: string;
    userId: string;
    name: string;
    aliases: string[];
    type: RelationshipType;
    sentiment: RelationshipSentiment;
    importance: number;
    firstMentioned: number;
    lastMentioned: number;
    mentionCount: number;
    recentMentions: Array<{
        date: number;
        context: string;
        sentiment: string;
    }>;
    themes: string[];
    positiveAspects: string[];
    painPoints: string[];
    lastPositiveMention?: number;
    lastNegativeMention?: number;
    mentionGapDays?: number;
    contextNotes: string[];
}
export interface ConnectionOpportunity {
    personId: string;
    personName: string;
    type: 'reconnect' | 'boundary' | 'appreciation' | 'check_in' | 'healing';
    reason: string;
    suggestedAction: string;
    urgency: 'low' | 'normal' | 'high';
}
export declare function extractPerson(transcript: string): {
    name: string;
    type: RelationshipType;
    context: string;
} | null;
/**
 * Extract all names mentioned in a transcript
 *
 * Returns an array of names with their context. This is used by the turn processor
 * to record all person mentions during a conversation.
 */
export declare function extractNames(transcript: string): Array<{
    name: string;
    context: string;
}>;
export declare function analyzeSentiment(context: string): RelationshipSentiment;
export declare function loadNetwork(userId: string): Promise<RelationshipPerson[]>;
export declare function savePerson(person: RelationshipPerson): Promise<void>;
export declare function recordMention(userId: string, extracted: {
    name: string;
    type: RelationshipType;
    context: string;
}): Promise<RelationshipPerson>;
export declare function findConnectionOpportunities(userId: string): Promise<ConnectionOpportunity[]>;
export declare function buildNetworkContext(userId: string): Promise<string>;
/**
 * Check for reconnection opportunities and trigger group outreach for high-urgency ones.
 * Should be called periodically (e.g., daily) to proactively reach out.
 */
export declare function checkAndTriggerReconnectionOutreach(userId: string): Promise<number>;
export declare const relationshipNetwork: {
    extractPerson: typeof extractPerson;
    analyzeSentiment: typeof analyzeSentiment;
    loadNetwork: typeof loadNetwork;
    recordMention: typeof recordMention;
    findOpportunities: typeof findConnectionOpportunities;
    checkReconnectionOutreach: typeof checkAndTriggerReconnectionOutreach;
    buildContext: typeof buildNetworkContext;
};
//# sourceMappingURL=relationship-network.d.ts.map