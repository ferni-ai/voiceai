/**
 * Unified Entity Store - Firestore Storage Layer
 *
 * Single source of truth for all entities (people, places, events, concepts).
 *
 * Collection structure:
 *   entity_store/{userId}/entities/{entityId}
 *   entity_store/{userId}/mentions/{mentionId}
 *   entity_store/{userId}/relationships/{relationshipId}
 *
 * @module memory/entity-store/storage
 */
import type { Entity, EntityRelationship, EntitySearchOptions, EntityType, Mention } from './types.js';
/**
 * Create a new entity
 */
export declare function createEntity(userId: string, entity: Omit<Entity, 'id'>): Promise<Entity>;
/**
 * Get an entity by ID
 */
export declare function getEntity(userId: string, entityId: string): Promise<Entity | null>;
/**
 * Update an entity
 */
export declare function updateEntity(userId: string, entityId: string, updates: Partial<Entity>): Promise<Entity | null>;
/**
 * Delete an entity
 */
export declare function deleteEntity(userId: string, entityId: string): Promise<boolean>;
/**
 * Find entity by alias (name, nickname, relationship term)
 */
export declare function findEntityByAlias(userId: string, alias: string, type?: EntityType): Promise<Entity | null>;
/**
 * Search entities by various criteria
 */
export declare function searchEntities(userId: string, searchText: string, options?: EntitySearchOptions): Promise<Entity[]>;
/**
 * Get all entities for a user
 */
export declare function getAllEntities(userId: string, options?: EntitySearchOptions): Promise<Entity[]>;
/**
 * Get entities by type
 */
export declare function getEntitiesByType(userId: string, type: EntityType, limit?: number): Promise<Entity[]>;
/**
 * Create a mention
 */
export declare function createMention(userId: string, mention: Omit<Mention, 'id'>): Promise<Mention>;
/**
 * Get mentions for an entity
 */
export declare function getMentionsForEntity(userId: string, entityId: string, limit?: number): Promise<Mention[]>;
/**
 * Get recent mentions for a user
 */
export declare function getRecentMentions(userId: string, limit?: number): Promise<Mention[]>;
/**
 * Create or update a relationship between entities
 */
export declare function upsertRelationship(userId: string, relationship: Omit<EntityRelationship, 'id'>): Promise<EntityRelationship>;
/**
 * Get relationships for an entity
 */
export declare function getRelationshipsForEntity(userId: string, entityId: string): Promise<EntityRelationship[]>;
/**
 * Increment mention count and update last mentioned timestamp
 */
export declare function recordMention(userId: string, entityId: string, mentionData?: {
    sentiment?: number;
    topics?: string[];
}): Promise<void>;
/**
 * Check if entity store is initialized for a user
 */
export declare function hasEntityStore(userId: string): Promise<boolean>;
/**
 * Get entity store stats for a user
 */
export declare function getEntityStoreStats(userId: string): Promise<{
    entityCount: number;
    mentionCount: number;
    relationshipCount: number;
    entityTypes: Record<EntityType, number>;
}>;
/**
 * Alias for getRelationshipsForEntity - backward compatibility
 */
export declare const getEntityRelationships: typeof getRelationshipsForEntity;
//# sourceMappingURL=storage.d.ts.map