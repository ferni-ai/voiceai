/**
 * Unified Entity Store
 *
 * The single source of truth for all user memory entities.
 * Provides CRUD operations, semantic search, and graph traversal.
 *
 * @module memory/entity-store/store
 */
import type { EdgeType, Entity, EntityAttributes, EntityRelationship, EntitySearchOptions, EntitySearchResult, EntityType } from './types.js';
/**
 * Unified Entity Store - the foundation of superhuman memory
 */
export declare class EntityStore {
    private db;
    private initialized;
    private entityCache;
    private userEntityIndex;
    /**
     * Initialize the store
     */
    initialize(): Promise<void>;
    /**
     * Ensure initialized before operations
     */
    private ensureInitialized;
    /**
     * Create a new entity
     */
    createEntity(userId: string, type: EntityType, name: string, attributes: EntityAttributes, options?: {
        aliases?: string[];
        confidence?: number;
        emotionalWeight?: number;
        sourceConversation?: string;
        sourcePersona?: string;
    }): Promise<Entity>;
    /**
     * Get entity by ID
     */
    getEntity(entityId: string): Promise<Entity | null>;
    /**
     * Update an entity
     */
    updateEntity(entityId: string, updates: Partial<Omit<Entity, 'id' | 'userId' | 'createdAt'>>): Promise<Entity | null>;
    /**
     * Delete an entity and its relationships
     */
    deleteEntity(entityId: string): Promise<boolean>;
    /**
     * Get all entities for a user
     */
    getUserEntities(userId: string, options?: {
        types?: EntityType[];
        limit?: number;
    }): Promise<Entity[]>;
    /**
     * Alias for searchEntities (for API compatibility)
     */
    search(userId: string, options: {
        embedding?: number[];
        query?: string;
        limit?: number;
        minScore?: number;
        types?: EntityType[];
    }): Promise<EntitySearchResult[]>;
    /**
     * Get recently mentioned entities
     */
    getRecentlyMentioned(userId: string, limit?: number): Promise<Entity[]>;
    /**
     * Get entities by type
     */
    getByType(userId: string, type: EntityType, limit?: number): Promise<Entity[]>;
    /**
     * Semantic search for entities
     */
    searchEntities(query: string, options: EntitySearchOptions): Promise<EntitySearchResult[]>;
    /**
     * BM25 keyword search
     */
    private bm25Search;
    /**
     * Vector similarity search
     */
    private vectorSearch;
    /**
     * Reciprocal Rank Fusion - combine multiple ranked lists
     */
    private reciprocalRankFusion;
    /**
     * Expand results with graph relationships
     */
    private expandWithGraph;
    /**
     * Create a relationship between entities
     * Uses the proper user-scoped subcollection path
     */
    createRelationship(fromEntityId: string, toEntityId: string, type: EdgeType, options?: {
        strength?: number;
        context?: string;
        bidirectional?: boolean;
    }): Promise<EntityRelationship>;
    /**
     * Get relationships for an entity
     * Note: Requires userId to locate the entity first, then uses the correct subcollection path
     */
    getEntityRelationships(entityId: string): Promise<EntityRelationship[]>;
    /**
     * Reinforce a relationship (increase strength)
     */
    reinforceRelationship(relationshipId: string): Promise<void>;
    /**
     * Record a mention of an entity
     */
    recordMention(entityId: string, context: {
        userId: string;
        conversationId: string;
        sessionId: string;
        personaId: string;
        snippet: string;
        emotionalWeight?: number;
        mentionContext?: 'direct' | 'indirect' | 'question' | 'response';
    }): Promise<void>;
    /**
     * Find or create entity by name/alias
     *
     * This is the key to solving the fragmentation problem:
     * "my brother" should always resolve to the same entity
     */
    resolveEntity(userId: string, name: string, type: EntityType, hints?: {
        relationship?: string;
        context?: string;
    }): Promise<{
        entity: Entity;
        isNew: boolean;
    }>;
    /**
     * Find entity by exact name or alias
     */
    private findEntityByNameOrAlias;
    /**
     * Build default attributes for entity type
     */
    private buildAttributesForType;
    private docToEntity;
    private toDate;
    private daysBetween;
    private buildExplanation;
}
/**
 * Get the singleton EntityStore instance
 */
export declare function getEntityStore(): EntityStore;
/**
 * Initialize the EntityStore
 */
export declare function initializeEntityStore(): Promise<EntityStore>;
//# sourceMappingURL=store.d.ts.map