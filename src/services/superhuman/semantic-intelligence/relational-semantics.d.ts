/**
 * Relational Semantics Graph - Better Than Human Service
 *
 * "Know which people bring joy vs. drain energy"
 *
 * Builds a semantic graph of how people in the user's life
 * correlate with emotional states:
 *   - Mentions of "mom" → 70% correlate with stress
 *   - Mentions of "Sarah" → 85% correlate with joy
 *   - "boss" appears before anxiety patterns 3x more than chance
 *
 * @module services/superhuman/semantic-intelligence/relational-semantics
 */
import type { RelationalNode, RelationalEdge } from './types.js';
/**
 * Record a mention of a person with emotional/topic context.
 *
 * Call this whenever someone is mentioned in conversation:
 * - Family members
 * - Friends
 * - Coworkers
 * - Anyone the user talks about
 */
export declare function recordPersonMention(userId: string, mention: {
    name: string;
    relationship?: string;
    context?: string;
    emotion?: string;
    sentiment?: number;
    topics?: string[];
}): Promise<RelationalNode | null>;
/**
 * Get all relational nodes for a user.
 */
export declare function getRelationalGraph(userId: string): Promise<{
    nodes: RelationalNode[];
    edges: RelationalEdge[];
}>;
/**
 * Get insights about a specific person.
 */
export declare function getPersonInsights(userId: string, personName: string): Promise<RelationalNode | null>;
/**
 * Get people associated with a specific emotion or topic.
 */
export declare function getPeopleByContext(userId: string, context: {
    emotion?: string;
    topic?: string;
}): Promise<RelationalNode[]>;
/**
 * Get the most impactful relationships (positive and negative).
 */
export declare function getImpactfulRelationships(userId: string): Promise<{
    energizing: RelationalNode[];
    draining: RelationalNode[];
}>;
/**
 * Build context string for LLM injection.
 */
export declare function buildRelationalContext(userId: string, currentContext?: {
    mentionedPerson?: string;
    currentEmotion?: string;
    currentTopic?: string;
}): Promise<string>;
/**
 * Record a connection between two people.
 */
export declare function recordConnection(userId: string, connection: {
    person1: string;
    person2: string;
    connectionType?: 'family' | 'work' | 'friend' | 'romantic' | 'unknown';
    context?: string;
    sentiment?: number;
}): Promise<void>;
/**
 * Clear relational cache for a user.
 */
export declare function clearRelationalCache(userId?: string): void;
export declare const relationalSemantics: {
    recordMention: typeof recordPersonMention;
    recordConnection: typeof recordConnection;
    getGraph: typeof getRelationalGraph;
    getPersonInsights: typeof getPersonInsights;
    getPeopleByContext: typeof getPeopleByContext;
    getImpactfulRelationships: typeof getImpactfulRelationships;
    buildContext: typeof buildRelationalContext;
    clearCache: typeof clearRelationalCache;
};
//# sourceMappingURL=relational-semantics.d.ts.map