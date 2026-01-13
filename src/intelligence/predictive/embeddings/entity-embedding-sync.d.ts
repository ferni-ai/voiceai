/**
 * Entity Embedding Sync
 *
 * Synchronizes embeddings between the Entity Store and predictive intelligence.
 *
 * SYNC FEATURES:
 * 1. Auto-embed entities when created/updated
 * 2. Feed entity mentions into trajectory patterns
 * 3. Link avoidance patterns to entities
 * 4. Update domain space from entity changes
 * 5. Track entity involvement in breakthroughs
 *
 * @module intelligence/predictive/embeddings/entity-embedding-sync
 */
import type { Entity, EntityType } from '../../../memory/entity-store/types.js';
export interface EntityEmbeddingUpdate {
    entityId: string;
    entityType: EntityType;
    embedding: number[];
    text: string;
    timestamp: number;
}
export interface EntityMentionEvent {
    userId: string;
    entityId: string;
    entityName: string;
    entityType: EntityType;
    context: string;
    emotionalContext?: string;
    timestamp: number;
}
export interface EntityTrajectoryLink {
    entityId: string;
    trajectoryPatternId: string;
    influenceType: 'trigger' | 'support' | 'context';
    timestamp: number;
}
/**
 * Generate embedding text for an entity
 */
export declare function buildEntityEmbeddingText(entity: Entity): string;
/**
 * Generate embedding for an entity
 */
export declare function generateEntityEmbedding(entity: Entity): Promise<number[]>;
/**
 * Batch generate embeddings for multiple entities
 */
export declare function generateEntityEmbeddingsBatch(entities: Entity[]): Promise<Map<string, number[]>>;
/**
 * Feed entity mention into trajectory patterns
 */
export declare function feedEntityMentionToTrajectory(userId: string, mention: EntityMentionEvent): Promise<void>;
/**
 * Link entity to avoidance pattern if relevant
 */
export declare function checkEntityForAvoidanceLink(userId: string, entity: Entity): Promise<boolean>;
/**
 * Record entity involvement in breakthrough
 */
export declare function recordEntityInBreakthrough(userId: string, entityIds: string[], breakthroughId: string, entities: Entity[]): Promise<void>;
/**
 * Sync entity changes to domain space
 */
export declare function syncEntityToDomainSpace(userId: string, entity: Entity): Promise<void>;
/**
 * Suggest entities that should be created based on predictive patterns
 */
export declare function suggestEntitiesFromPatterns(userId: string): Promise<Array<{
    name: string;
    type: EntityType;
    reason: string;
}>>;
/**
 * Update entity salience based on predictive patterns
 */
export declare function updateEntitySalienceFromPatterns(userId: string, entityId: string, factor: 'avoidance' | 'breakthrough' | 'trajectory' | 'intervention'): Promise<number>;
/**
 * Full sync of all entities to predictive intelligence
 */
export declare function syncAllEntitiesToPredictive(userId: string): Promise<{
    entitiesProcessed: number;
    avoidanceLinksFound: number;
    domainUpdates: number;
}>;
export declare const entityEmbeddingSync: {
    buildEntityEmbeddingText: typeof buildEntityEmbeddingText;
    generateEntityEmbedding: typeof generateEntityEmbedding;
    generateEntityEmbeddingsBatch: typeof generateEntityEmbeddingsBatch;
    feedEntityMentionToTrajectory: typeof feedEntityMentionToTrajectory;
    checkEntityForAvoidanceLink: typeof checkEntityForAvoidanceLink;
    recordEntityInBreakthrough: typeof recordEntityInBreakthrough;
    syncEntityToDomainSpace: typeof syncEntityToDomainSpace;
    suggestEntitiesFromPatterns: typeof suggestEntitiesFromPatterns;
    updateEntitySalienceFromPatterns: typeof updateEntitySalienceFromPatterns;
    syncAllEntitiesToPredictive: typeof syncAllEntitiesToPredictive;
};
export default entityEmbeddingSync;
//# sourceMappingURL=entity-embedding-sync.d.ts.map