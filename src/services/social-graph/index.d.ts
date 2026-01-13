/**
 * Social Graph Intelligence Service
 *
 * Tracks relationships mentioned in conversations to provide superhuman
 * relationship awareness without accessing actual messages or contacts.
 *
 * Privacy-First Approach:
 * - Only tracks names mentioned IN CONVERSATION with Ferni
 * - Never accesses call logs, messages, or contacts directly
 * - User explicitly confirms relationship importance
 * - All data deletable on request
 *
 * Superhuman Capabilities:
 * - "You haven't mentioned Sarah in 3 weeks - everything okay?"
 * - "You always seem happier after talking to your brother"
 * - "Today's your mom's birthday - how are you feeling about it?"
 *
 * @module services/social-graph
 */
export type RelationshipType = 'family' | 'friend' | 'partner' | 'coworker' | 'acquaintance' | 'professional' | 'unknown';
export interface Person {
    id: string;
    name: string;
    aliases: string[];
    relationship: RelationshipType;
    importance: number;
    /** Important dates (birthdays, anniversaries) */
    importantDates: Array<{
        date: string;
        type: 'birthday' | 'anniversary' | 'memorial' | 'other';
        label?: string;
    }>;
    /** Last time this person was mentioned */
    lastMentioned: Date;
    /** Total mention count */
    mentionCount: number;
    /** Average sentiment when discussing this person */
    averageSentiment: number;
    /** Topics often discussed about this person */
    associatedTopics: string[];
    /** Notes about the relationship */
    notes: string[];
    /** User-confirmed important person */
    isConfirmedImportant: boolean;
    createdAt: Date;
    updatedAt: Date;
}
export interface Mention {
    personId: string;
    timestamp: Date;
    sentiment: number;
    context: string;
    topics: string[];
    emotionalWeight: number;
}
export interface RelationshipPattern {
    personId: string;
    personName: string;
    pattern: 'positive_correlation' | 'negative_correlation' | 'neutral';
    description: string;
    confidence: number;
}
export interface WithdrawalAlert {
    personId: string;
    personName: string;
    daysSinceLastMention: number;
    usualFrequencyDays: number;
    significance: 'low' | 'medium' | 'high';
    suggestion: string;
}
export interface ImportantDate {
    personId: string;
    personName: string;
    date: Date;
    type: 'birthday' | 'anniversary' | 'memorial' | 'other';
    label?: string;
    daysUntil: number;
}
export interface SocialInsight {
    type: 'withdrawal' | 'pattern' | 'date' | 'sentiment';
    insight: string;
    suggestion?: string;
    personName: string;
    urgency: 'low' | 'medium' | 'high';
}
interface UserSocialGraph {
    userId: string;
    people: Map<string, Person>;
    mentions: Mention[];
    patterns: RelationshipPattern[];
    lastAnalysis: Date;
}
/**
 * Record a person mention from conversation
 */
export declare function recordMention(userId: string, name: string, context: string, sentiment: number, topics?: string[], emotionalWeight?: number): Person;
/**
 * Extract names from conversation text
 */
export declare function extractNames(text: string): Array<{
    name: string;
    context: string;
}>;
/**
 * Detect withdrawal - when someone important hasn't been mentioned
 */
export declare function detectWithdrawal(userId: string): WithdrawalAlert[];
/**
 * Detect sentiment patterns - who makes the user happy/stressed
 */
export declare function detectSentimentPatterns(userId: string): RelationshipPattern[];
/**
 * Get upcoming important dates
 */
export declare function getUpcomingDates(userId: string, daysAhead?: number): ImportantDate[];
/**
 * Add important date for a person
 */
export declare function addImportantDate(userId: string, personName: string, date: string, // MM-DD format
type: 'birthday' | 'anniversary' | 'memorial' | 'other', label?: string): boolean;
/**
 * Generate social insights for context injection
 */
export declare function generateSocialInsights(userId: string): SocialInsight[];
/**
 * Generate superhuman social moment
 */
export declare function generateSuperhumanMoment(userId: string): string | null;
export declare function getImportantPeople(userId: string): Person[];
export declare function getPerson(userId: string, personId: string): Person | undefined;
export declare function confirmImportantPerson(userId: string, personId: string): boolean;
export declare function getMentionFrequency(userId: string, personName: string, days: number): number;
export declare function clearSocialGraph(userId: string): void;
/**
 * Get the in-memory graph for a user (for persistence)
 */
export declare function getUserGraph(userId: string): UserSocialGraph | undefined;
/**
 * Serialize graph for storage
 */
export declare function serializeGraph(graph: UserSocialGraph): object;
/**
 * Persist graph to Firestore
 */
export declare function persistGraphToFirestore(userId: string, graph: UserSocialGraph): Promise<void>;
/**
 * Load graph from Firestore
 */
export declare function loadGraphFromFirestore(userId: string): Promise<void>;
/**
 * Get all people from the social graph
 */
export declare function getAllPeople(userId: string): Person[];
/**
 * Get all social insights
 */
export declare function getSocialInsights(userId: string): SocialInsight[];
/**
 * Clear all cached social graphs (for memory management)
 * Call this on app shutdown or when memory pressure is high
 */
export declare function clearAllSocialGraphs(): void;
/**
 * Get count of cached graphs (for monitoring)
 */
export declare function getCachedGraphCount(): number;
/**
 * Prune old mentions from a user's graph
 * Keeps only mentions from last N days
 */
export declare function pruneMentions(userId: string, retentionDays?: number): number;
/**
 * Cleanup graphs for inactive users (no mentions in last N days)
 * Call this periodically to prevent memory growth
 */
export declare function cleanupInactiveGraphs(inactiveDays?: number): number;
declare const _default: {
    recordMention: typeof recordMention;
    extractNames: typeof extractNames;
    detectWithdrawal: typeof detectWithdrawal;
    detectSentimentPatterns: typeof detectSentimentPatterns;
    getUpcomingDates: typeof getUpcomingDates;
    addImportantDate: typeof addImportantDate;
    generateSocialInsights: typeof generateSocialInsights;
    generateSuperhumanMoment: typeof generateSuperhumanMoment;
    getImportantPeople: typeof getImportantPeople;
    getAllPeople: typeof getAllPeople;
    getSocialInsights: typeof getSocialInsights;
    getPerson: typeof getPerson;
    confirmImportantPerson: typeof confirmImportantPerson;
    getMentionFrequency: typeof getMentionFrequency;
    clearSocialGraph: typeof clearSocialGraph;
    clearAllSocialGraphs: typeof clearAllSocialGraphs;
    getCachedGraphCount: typeof getCachedGraphCount;
    pruneMentions: typeof pruneMentions;
    cleanupInactiveGraphs: typeof cleanupInactiveGraphs;
    getUserGraph: typeof getUserGraph;
    serializeGraph: typeof serializeGraph;
    persistGraphToFirestore: typeof persistGraphToFirestore;
    loadGraphFromFirestore: typeof loadGraphFromFirestore;
};
export default _default;
//# sourceMappingURL=index.d.ts.map