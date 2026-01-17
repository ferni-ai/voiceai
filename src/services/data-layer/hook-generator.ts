/**
 * Hook Generator
 *
 * Factory pattern for creating domain-specific store hooks.
 * Each domain can define its own typed hook functions that automatically
 * integrate with the semantic indexing pipeline.
 *
 * @module services/data-layer/hook-generator
 */

import { onStoreChange } from './store-hooks.js';
import type { ChangeType, EntityType, StoreType } from './types.js';

// ============================================================================
// TYPES
// ============================================================================

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
export type DomainHook<T> = (
  userId: string,
  entityId: string,
  entity: T,
  changeType?: ChangeType
) => void;

// ============================================================================
// HOOK GENERATOR
// ============================================================================

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
export function createDomainHook<T extends object>(config: HookConfig<T>): DomainHook<T> {
  const { storeType, entityType, contentBuilder, metadataExtractor, shouldSkip } = config;

  return function hook(
    userId: string,
    entityId: string,
    entity: T,
    changeType: ChangeType = 'update'
  ): void {
    // Check if we should skip this entity
    if (shouldSkip && shouldSkip(entity)) {
      return;
    }

    // Build content for embedding
    const content = contentBuilder(entity);

    // Extract metadata
    const metadata = metadataExtractor ? metadataExtractor(entity) : {};

    // Dispatch to central hook
    onStoreChange({
      storeType,
      changeType,
      userId,
      entityType,
      entityId,
      content,
      metadata,
    });
  };
}

// ============================================================================
// BATCH HOOK GENERATOR
// ============================================================================

/**
 * Creates multiple hooks at once for a domain
 */
export function createDomainHooks<T extends Record<string, HookConfig<object>>>(
  configs: T
): { [K in keyof T]: DomainHook<Parameters<T[K]['contentBuilder']>[0]> } {
  const hooks = {} as { [K in keyof T]: DomainHook<Parameters<T[K]['contentBuilder']>[0]> };

  for (const [name, config] of Object.entries(configs)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    hooks[name as keyof T] = createDomainHook(
      config as HookConfig<object>
    ) as unknown as DomainHook<Parameters<(typeof config)['contentBuilder']>[0]>;
  }

  return hooks;
}

// ============================================================================
// CONTENT BUILDER HELPERS
// ============================================================================

/**
 * Helper to join non-empty values with a separator
 */
export function joinNonEmpty(parts: Array<string | undefined | null>, separator = ' '): string {
  return parts.filter((p) => p && p.trim()).join(separator);
}

/**
 * Helper to format a field with label
 */
export function formatField(label: string, value: unknown): string {
  if (value === undefined || value === null || value === '') return '';
  if (Array.isArray(value)) {
    return value.length > 0 ? `${label}: ${value.join(', ')}.` : '';
  }
  return `${label}: ${value}.`;
}

/**
 * Helper to format date nicely
 */
export function formatDate(date: string | Date | undefined): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Helper to format currency
 */
export function formatCurrency(amount: number | undefined): string {
  if (amount === undefined || amount === null) return '';
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

// ============================================================================
// GENERIC ENTITY BUILDER
// ============================================================================

/**
 * Creates a content builder from a field configuration
 */
export function createContentBuilder<T extends Record<string, unknown>>(
  entityLabel: string,
  fields: Array<{
    key: keyof T;
    label?: string;
    formatter?: (value: unknown) => string;
  }>
): ContentBuilder<T> {
  return (entity: T): string => {
    const parts: string[] = [`${entityLabel}:`];

    for (const field of fields) {
      const value = entity[field.key];
      if (value === undefined || value === null || value === '') continue;

      const formatted = field.formatter ? field.formatter(value) : String(value);
      if (field.label) {
        parts.push(`${field.label}: ${formatted}.`);
      } else {
        parts.push(formatted);
      }
    }

    return parts.join(' ');
  };
}

export default {
  createDomainHook,
  createDomainHooks,
  joinNonEmpty,
  formatField,
  formatDate,
  formatCurrency,
  createContentBuilder,
};
