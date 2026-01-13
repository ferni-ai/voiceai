/**
 * Indexing Policy Configuration
 *
 * Defines what data gets indexed to semantic memory and how.
 * Not everything needs semantic search - use this policy to control costs
 * and search quality.
 *
 * @module services/data-layer/indexing-policy
 */
import type { EntityIndexingPolicy, IndexingPolicy, EntityType } from './types.js';
export declare const DEFAULT_INDEXING_POLICY: IndexingPolicy;
/**
 * Get the current indexing policy
 */
export declare function getIndexingPolicy(): IndexingPolicy;
/**
 * Update the indexing policy
 */
export declare function setIndexingPolicy(policy: Partial<IndexingPolicy>): void;
/**
 * Get policy for a specific entity type
 */
export declare function getEntityPolicy(entityType: EntityType): EntityIndexingPolicy | undefined;
/**
 * Check if an entity should be indexed based on policy
 */
export declare function shouldIndex(entityType: EntityType, entity: Record<string, unknown>): {
    shouldIndex: boolean;
    reason: string;
};
/**
 * Build indexable content from entity based on policy
 */
export declare function buildIndexContent(entityType: EntityType, entity: Record<string, unknown>): string;
/**
 * Get all policies as a record keyed by entity type
 */
export declare function getAllPolicies(): Record<EntityType, EntityIndexingPolicy>;
/**
 * Get all policies grouped by domain
 */
export declare function getPoliciesByDomain(): Record<string, EntityIndexingPolicy[]>;
//# sourceMappingURL=indexing-policy.d.ts.map