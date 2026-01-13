/**
 * Relationship Graph - V3.3 Relational Network
 *
 * Builds a semantic graph of the user's relationships:
 * - Who they know and how (mom, friend Sarah, boss)
 * - Connections between people (Mom doesn't like Sarah)
 * - Emotional impact of each person
 * - Topics associated with each person
 * - Support patterns (who helps with what)
 *
 * @module services/superhuman/semantic-intelligence/relationship-graph
 */
export type RelationshipType = 'family' | 'friend' | 'romantic' | 'colleague' | 'professional' | 'acquaintance' | 'pet' | 'unknown';
export type ConnectionType = 'positive' | 'negative' | 'neutral' | 'complex' | 'supportive' | 'conflicted';
export interface PersonNode {
    id: string;
    userId: string;
    name: string;
    aliases: string[];
    relationship: RelationshipType;
    type?: string;
    mentionCount: number;
    interactionCount?: number;
    emotionalImpact: number;
    supportScore: number;
    associatedTopics: string[];
    recentTopics: string[];
    topics?: string[];
    firstMentioned: Date;
    lastMentioned: Date;
    mentionFrequency: number;
    embedding?: number[];
}
export interface PersonConnection {
    id: string;
    userId: string;
    personA: string;
    personB: string;
    type: ConnectionType;
    description: string;
    confidence: number;
    evidence: Array<{
        text: string;
        timestamp: Date;
    }>;
    created: Date;
    updated: Date;
}
export interface SupportPattern {
    personId: string;
    domain: string;
    description: string;
    strength: number;
}
export interface RelationshipGraphSummary {
    totalPeople: number;
    energizingCount: number;
    drainingCount: number;
    conflictCount: number;
    topSupporter?: string;
    mostMentioned?: string;
    recentlyMentioned: string[];
}
/**
 * Add or update a person in the graph.
 */
export declare function upsertPerson(userId: string, person: {
    name: string;
    relationship?: RelationshipType;
    emotion?: string;
    sentiment?: number;
    topic?: string;
    context?: string;
}): Promise<PersonNode>;
/**
 * Find a person by name or alias.
 */
export declare function findPersonByName(userId: string, name: string): Promise<PersonNode | null>;
/**
 * Get all people in the user's graph.
 */
export declare function getAllPeople(userId: string): Promise<PersonNode[]>;
/**
 * Get people by relationship type.
 */
export declare function getPeopleByRelationship(userId: string, relationship: RelationshipType): Promise<PersonNode[]>;
/**
 * Get energizing vs draining people.
 */
export declare function getPeopleByImpact(userId: string): Promise<{
    energizing: PersonNode[];
    draining: PersonNode[];
    neutral: PersonNode[];
}>;
/**
 * Get most mentioned people.
 */
export declare function getMostMentioned(userId: string, limit?: number): Promise<PersonNode[]>;
/**
 * Get recently mentioned people.
 */
export declare function getRecentlyMentioned(userId: string, days?: number): Promise<PersonNode[]>;
/**
 * Record a connection between two people.
 */
export declare function recordConnection(userId: string, connection: {
    personA: string;
    personB: string;
    type: ConnectionType;
    description: string;
    evidence: string;
}): Promise<PersonConnection | null>;
/**
 * Get all connections for a person.
 */
export declare function getConnectionsForPerson(userId: string, personName: string): Promise<Array<{
    person: PersonNode;
    connection: PersonConnection;
}>>;
/**
 * Get conflicts in the user's network.
 */
export declare function getConflicts(userId: string): Promise<PersonConnection[]>;
/**
 * Update support score for a person.
 */
export declare function updateSupportScore(userId: string, personName: string, domain: string, wasSupport: boolean): Promise<void>;
/**
 * Get top supporters.
 */
export declare function getTopSupporters(userId: string, limit?: number): Promise<PersonNode[]>;
/**
 * Get a summary of the relationship graph.
 */
export declare function getGraphSummary(userId: string): Promise<RelationshipGraphSummary>;
/**
 * Format relationship graph for LLM context.
 */
export declare function formatGraphForContext(userId: string, currentPerson?: string): Promise<string>;
export declare function clearGraphCache(userId?: string): void;
export declare const relationshipGraph: {
    upsertPerson: typeof upsertPerson;
    findPerson: typeof findPersonByName;
    getAllPeople: typeof getAllPeople;
    getByRelationship: typeof getPeopleByRelationship;
    getByImpact: typeof getPeopleByImpact;
    getMostMentioned: typeof getMostMentioned;
    getRecentlyMentioned: typeof getRecentlyMentioned;
    recordConnection: typeof recordConnection;
    getConnectionsFor: typeof getConnectionsForPerson;
    getConflicts: typeof getConflicts;
    updateSupportScore: typeof updateSupportScore;
    getTopSupporters: typeof getTopSupporters;
    getSummary: typeof getGraphSummary;
    format: typeof formatGraphForContext;
    clearCache: typeof clearGraphCache;
};
export default relationshipGraph;
//# sourceMappingURL=relationship-graph.d.ts.map