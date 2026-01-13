/**
 * Hook Generator
 *
 * Factory pattern for creating domain-specific store hooks.
 * Each domain can define its own typed hook functions that automatically
 * integrate with the semantic indexing pipeline.
 *
 * @module services/data-layer/hook-generator
 */
import type { ChangeType, EntityType, StoreType } from './types.js';
/**
 * Content builder function signature
 * Takes an entity and returns the text content for embedding
 */
export type ContentBuilder<T> = (entity: T) => string;
/**
 * Metadata extractor function signature
 * Extracts additional metadata from entity for filtering
 */
export type MetadataExtractor<T> = (entity: T) => Record<string, unknown>;
/**
 * Hook configuration for a specific entity type
 */
export interface HookConfig<T> {
    /** Store type this hook belongs to */
    storeType: StoreType;
    /** Entity type for indexing */
    entityType: EntityType;
    /** Function to build text content for embedding */
    contentBuilder: ContentBuilder<T>;
    /** Optional function to extract additional metadata */
    metadataExtractor?: MetadataExtractor<T>;
    /** Whether to skip indexing based on entity state */
    shouldSkip?: (entity: T) => boolean;
}
/**
 * Generated hook function signature
 */
export type DomainHook<T> = (userId: string, entityId: string, entity: T, changeType?: ChangeType) => void;
/**
 * Creates a typed hook function for a specific domain entity.
 *
 * @example
 * ```typescript
 * const onCommitmentChange = createDomainHook<CommitmentEntity>({
 *   storeType: 'trust',
 *   entityType: 'commitment',
 *   contentBuilder: (c) => `Commitment: ${c.description}. Status: ${c.status}`,
 *   metadataExtractor: (c) => ({ madeBy: c.madeBy, deadline: c.deadline }),
 *   shouldSkip: (c) => c.status === 'cancelled',
 * });
 *
 * // Usage in service:
 * onCommitmentChange(userId, commitment.id, commitment, 'create');
 * ```
 */
export declare function createDomainHook<T extends object>(config: HookConfig<T>): DomainHook<T>;
/**
 * Creates multiple hooks at once for a domain
 */
export declare function createDomainHooks<T extends Record<string, HookConfig<object>>>(configs: T): {
    [K in keyof T]: DomainHook<Parameters<T[K]['contentBuilder']>[0]>;
};
/**
 * Helper to join non-empty values with a separator
 */
export declare function joinNonEmpty(parts: Array<string | undefined | null>, separator?: string): string;
/**
 * Helper to format a field with label
 */
export declare function formatField(label: string, value: unknown): string;
/**
 * Helper to format date nicely
 */
export declare function formatDate(date: string | Date | undefined): string;
/**
 * Helper to format currency
 */
export declare function formatCurrency(amount: number | undefined): string;
/**
 * Creates a content builder from a field configuration
 */
export declare function createContentBuilder<T extends Record<string, unknown>>(entityLabel: string, fields: Array<{
    key: keyof T;
    label?: string;
    formatter?: (value: unknown) => string;
}>): ContentBuilder<T>;
declare const _default: {
    createDomainHook: typeof createDomainHook;
    createDomainHooks: typeof createDomainHooks;
    joinNonEmpty: typeof joinNonEmpty;
    formatField: typeof formatField;
    formatDate: typeof formatDate;
    formatCurrency: typeof formatCurrency;
    createContentBuilder: typeof createContentBuilder;
};
export default _default;
//# sourceMappingURL=hook-generator.d.ts.map