/**
 * Relational Network Intelligence
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Deep understanding of the PEOPLE in the user's life - not just names,
 * but dynamics, tensions, support networks, and relational patterns.
 *
 * "You mention your sister a lot, but it sounds like there's something unresolved there."
 *
 * This is superhuman because even close friends don't track all these
 * relationships with the clarity that Ferni can.
 */
export type RelationshipType = 'family' | 'romantic' | 'friend' | 'professional' | 'other';
export type RelationshipQuality = 'supportive' | 'complicated' | 'strained' | 'distant' | 'unknown';
export type DynamicType = 'competition' | 'alliance' | 'conflict' | 'avoidance' | 'enmeshment' | 'estrangement' | 'healing';
export interface PersonInLife {
    /** Unique identifier */
    id: string;
    /** Name as user refers to them */
    name: string;
    /** Alternative names/references */
    aliases: string[];
    /** Relationship to user */
    relationshipType: RelationshipType;
    /** Specific role (e.g., "mother", "boss", "best friend") */
    specificRole: string;
    /** Quality of relationship */
    quality: RelationshipQuality;
    /** Topics associated with this person */
    associatedTopics: string[];
    /** Emotional tone when discussed */
    emotionalTone: {
        typical: string;
        intensity: number;
        volatility: number;
    };
    /** What user wants from this relationship */
    desires: string[];
    /** What's difficult about this relationship */
    challenges: string[];
    /** Key events/history */
    significantEvents: Array<{
        description: string;
        date?: Date;
        emotionalImpact: 'positive' | 'negative' | 'mixed';
        resolved: boolean;
    }>;
    /** Last mentioned */
    lastMentioned: Date;
    /** Mention frequency (mentions per conversation) */
    mentionFrequency: number;
    /** Is this person currently a source of stress? */
    currentStressSource: boolean;
    /** Is this person a support source? */
    isSupportSource: boolean;
}
export interface Triangulation {
    /** First person in the dynamic */
    person1Id: string;
    /** Second person in the dynamic */
    person2Id: string;
    /** Nature of their dynamic */
    dynamic: DynamicType;
    /** How this affects the user */
    userImpact: string;
    /** Evidence/quotes */
    evidence: string[];
    /** Confidence */
    confidence: number;
}
export interface UnspokenTension {
    /** With whom */
    personId: string;
    /** About what */
    topic: string;
    /** Last mentioned (even indirectly) */
    lastMentioned: Date;
    /** How much they avoid it (0-1) */
    avoidanceLevel: number;
    /** Signs of readiness to address */
    readinessSignals: string[];
    /** Suggested approach when ready */
    approachSuggestion: string;
}
export interface SupportNetwork {
    /** Inner circle (1-3 people they truly lean on) */
    innerCircle: string[];
    /** Outer circle (5-10 people they have some support from) */
    outerCircle: string[];
    /** Acquaintances they mention but don't rely on */
    periphery: string[];
    /** Missing roles in their support network */
    gaps: Array<{
        role: string;
        impact: string;
        detected: Date;
    }>;
    /** Overall network health */
    health: {
        score: number;
        strengths: string[];
        vulnerabilities: string[];
    };
}
export interface RelationalNetwork {
    userId: string;
    /** All people mentioned */
    people: Map<string, PersonInLife>;
    /** Dynamics between people */
    triangulations: Triangulation[];
    /** Things they're avoiding discussing */
    unspokenTensions: UnspokenTension[];
    /** Support network analysis */
    supportNetwork: SupportNetwork;
    /** Metadata */
    metadata: {
        totalPeopleMentioned: number;
        lastUpdated: Date;
        analysisConfidence: number;
    };
}
/**
 * Get or create relational network for user
 */
export declare function getRelationalNetwork(userId: string): RelationalNetwork;
/**
 * Extract person mentions from text
 */
export declare function extractPersonMentions(text: string, emotion: string, emotionIntensity: number): Array<{
    name: string;
    type: RelationshipType;
    role: string;
    contextSnippet: string;
    emotionalTone: string;
}>;
/**
 * Update or create a person in the network
 */
export declare function recordPersonMention(userId: string, mention: {
    name: string;
    type: RelationshipType;
    role: string;
    contextSnippet: string;
    emotionalTone: string;
    emotionIntensity: number;
    topics: string[];
    wasPositive: boolean;
    wasStressed: boolean;
}): PersonInLife;
/**
 * Detect unspoken tension in text
 */
export declare function detectUnspokenTension(userId: string, text: string, mentionedPerson: PersonInLife | null, topics: string[]): UnspokenTension | null;
/**
 * Analyze and update support network
 */
export declare function analyzeSupportNetwork(userId: string): SupportNetwork;
export interface RelationalInsight {
    type: 'pattern' | 'tension' | 'support_gap' | 'dynamic';
    subject: string;
    observation: string;
    suggestedApproach: string;
    confidence: number;
    shouldSurface: boolean;
    surfacePhrase?: string;
}
/**
 * Generate insights about relational patterns
 */
export declare function generateRelationalInsights(userId: string): RelationalInsight[];
/**
 * Format insights for prompt injection
 */
export declare function formatRelationalInsightsForPrompt(userId: string, currentPersonMentioned?: string): string | null;
/**
 * Import a relational network into memory (for persistence)
 */
export declare function importRelationalNetwork(network: RelationalNetwork): void;
/**
 * Reset all relational network state (for testing)
 */
export declare function resetRelationalNetwork(): void;
declare const _default: {
    getRelationalNetwork: typeof getRelationalNetwork;
    extractPersonMentions: typeof extractPersonMentions;
    recordPersonMention: typeof recordPersonMention;
    detectUnspokenTension: typeof detectUnspokenTension;
    analyzeSupportNetwork: typeof analyzeSupportNetwork;
    generateRelationalInsights: typeof generateRelationalInsights;
    formatRelationalInsightsForPrompt: typeof formatRelationalInsightsForPrompt;
    resetRelationalNetwork: typeof resetRelationalNetwork;
};
export default _default;
//# sourceMappingURL=relationships.d.ts.map