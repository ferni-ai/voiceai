/**
 * Entity Store Synergy - Embedding Integration
 *
 * Connects the embedding-powered predictive intelligence with the
 * Entity Store's knowledge graph.
 *
 * SYNERGIES:
 * 1. Use entity embeddings for semantic avoidance detection
 * 2. Link trajectory patterns to involved entities
 * 3. Associate breakthroughs with entity context
 * 4. Enrich ripple space with entity relationships
 * 5. Ground intervention matching in entity knowledge
 *
 * @module intelligence/predictive/embeddings/entity-synergy
 */
import type { Entity, EntityType } from '../../../memory/entity-store/types.js';
export interface EntityContext {
    entities: Entity[];
    relationships: Array<{
        from: Entity;
        to: Entity;
        type: string;
    }>;
}
export interface EntityAvoidanceLink {
    entity: Entity;
    avoidanceSimilarity: number;
    possibleReasons: string[];
}
export interface EntityTrajectoryContext {
    involvedEntities: Entity[];
    entityInfluence: Array<{
        entity: Entity;
        influence: 'trigger' | 'support' | 'context';
        confidence: number;
    }>;
}
export interface EntityBreakthroughContext {
    relatedEntities: Entity[];
    entityInsights: Array<{
        entity: Entity;
        connection: string;
    }>;
}
/**
 * Find entities that might be related to avoided topics
 */
export declare function findEntitiesRelatedToAvoidance(userId: string, avoidedTopicEmbedding: number[], entityTypes?: EntityType[]): Promise<EntityAvoidanceLink[]>;
/**
 * Get entity context for trajectory pattern
 */
export declare function getEntityContextForTrajectory(userId: string, trajectoryDescription: string, lifeDomains: string[]): Promise<EntityTrajectoryContext>;
/**
 * Find entities related to a breakthrough
 */
export declare function findEntitiesForBreakthrough(userId: string, breakthroughTopic: string, insightEmbedding: number[]): Promise<EntityBreakthroughContext>;
/**
 * Get entities for ripple effect domain
 */
export declare function getEntitiesForDomain(userId: string, domain: string): Promise<Entity[]>;
/**
 * Find people entities that might be involved in situation
 */
export declare function findPeopleInSituation(userId: string, situationTranscript: string): Promise<Entity[]>;
/**
 * Enrich avoidance with entity knowledge
 */
export declare function enrichAvoidanceWithEntities(userId: string, avoidedTopics: Array<{
    topic: string;
    embedding: number[];
}>): Promise<Array<{
    topic: string;
    relatedEntities: Entity[];
    entityPatterns: string[];
}>>;
/**
 * Build entity-enriched context for embedding intelligence
 */
export declare function buildEntityEnrichedContext(userId: string, currentTopic?: string): Promise<string>;
export declare const entitySynergy: {
    findEntitiesRelatedToAvoidance: typeof findEntitiesRelatedToAvoidance;
    getEntityContextForTrajectory: typeof getEntityContextForTrajectory;
    findEntitiesForBreakthrough: typeof findEntitiesForBreakthrough;
    getEntitiesForDomain: typeof getEntitiesForDomain;
    findPeopleInSituation: typeof findPeopleInSituation;
    enrichAvoidanceWithEntities: typeof enrichAvoidanceWithEntities;
    buildEntityEnrichedContext: typeof buildEntityEnrichedContext;
};
export default entitySynergy;
//# sourceMappingURL=entity-synergy.d.ts.map