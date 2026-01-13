/**
 * Entity Resolver - Resolves mentions to canonical entities
 *
 * This is the brain of entity management. When someone says "my brother" or "Mike"
 * or "my bro", this service figures out which entity they're referring to,
 * handling ambiguity, creating new entities, and merging duplicates.
 *
 * @module memory/entity-store/entity-resolver
 */
import type { Entity, PersonCaptureInput, ExtractedFact } from './types.js';
export interface ResolvedEntity {
    entity: Entity;
    confidence: number;
    isNew: boolean;
    merged: boolean;
    resolvedFrom: 'exact_name' | 'alias' | 'relationship' | 'semantic' | 'created';
}
/**
 * Resolve a person mention to an entity
 *
 * Resolution strategy (in order):
 * 1. Exact canonical name match
 * 2. Alias match (nicknames, alternate names)
 * 3. Relationship match ("my brother" → find entity with specificRelation="brother")
 * 4. Semantic similarity (embedding-based)
 * 5. Create new entity
 */
export declare function resolvePerson(userId: string, input: PersonCaptureInput): Promise<ResolvedEntity>;
/**
 * Merge multiple entities into one
 *
 * Used when we discover that two entities are actually the same person.
 * For example: "my brother" entity and "Mike" entity turn out to be the same.
 */
export declare function mergeEntities(userId: string, primaryEntityId: string, secondaryEntityIds: string[]): Promise<Entity | null>;
/**
 * Get everything we know about an entity
 */
export declare function whatDoWeKnowAbout(userId: string, query: string): Promise<{
    entity: Entity | null;
    mentions: import('./types.js').Mention[];
    facts: import('./types.js').ExtractedFact[];
    relationships: import('./types.js').EntityRelationship[];
    relatedEntities: Entity[];
}>;
/**
 * Entity Resolver - singleton accessor pattern
 *
 * This provides a facade for entity resolution operations used by
 * higher-level modules like knowledge-graph.
 */
/**
 * Input for resolving a mention
 */
export interface MentionInput {
    text?: string;
    name?: string;
    relationship?: string;
    type?: string;
    phone?: string;
    email?: string;
}
/**
 * Query for resolving an entity
 */
export interface EntityQuery {
    id?: string;
    name?: string;
    type?: string;
}
export interface EntityResolver {
    /** Resolve a person mention to a canonical entity */
    resolvePerson: typeof resolvePerson;
    /** Merge duplicate entities */
    mergeEntities: typeof mergeEntities;
    /** Get everything we know about an entity */
    whatDoWeKnowAbout: typeof whatDoWeKnowAbout;
    /** Check if resolver is ready */
    isReady: () => boolean;
    /** Resolve a mention (name/relationship) to a canonical entity */
    resolveMention: (userId: string, mention: MentionInput) => Promise<Entity | null>;
    /** Add a relationship between two entities */
    addRelationship: (userId: string, fromId: string, toId: string, type: string) => Promise<void>;
    /** Resolve an entity by ID or query */
    resolve: (userId: string, query: string | EntityQuery) => Promise<Entity | null>;
    /** Get all people entities for a user */
    getPeople: (userId: string, limit?: number) => Promise<Entity[]>;
    /** Get facts about an entity */
    getFacts: (userId: string, entityId: string) => Promise<ExtractedFact[]>;
    /** Get a specific entity by ID */
    getEntity: (userId: string, entityId: string) => Promise<Entity | null>;
    /** Get entities by type */
    getEntitiesByType: (userId: string, type: string, limit?: number) => Promise<Entity[]>;
}
/**
 * Get the entity resolver singleton
 */
export declare function getEntityResolver(): EntityResolver;
//# sourceMappingURL=entity-resolver.d.ts.map