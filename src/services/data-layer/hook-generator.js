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
export function createDomainHook(config) {
    const { storeType, entityType, contentBuilder, metadataExtractor, shouldSkip } = config;
    return function hook(userId, entityId, entity, changeType = 'update') {
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
export function createDomainHooks(configs) {
    const hooks = {};
    for (const [name, config] of Object.entries(configs)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        hooks[name] = createDomainHook(config);
    }
    return hooks;
}
// ============================================================================
// CONTENT BUILDER HELPERS
// ============================================================================
/**
 * Helper to join non-empty values with a separator
 */
export function joinNonEmpty(parts, separator = ' ') {
    return parts.filter((p) => p && p.trim()).join(separator);
}
/**
 * Helper to format a field with label
 */
export function formatField(label, value) {
    if (value === undefined || value === null || value === '')
        return '';
    if (Array.isArray(value)) {
        return value.length > 0 ? `${label}: ${value.join(', ')}.` : '';
    }
    return `${label}: ${value}.`;
}
/**
 * Helper to format date nicely
 */
export function formatDate(date) {
    if (!date)
        return '';
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
/**
 * Helper to format currency
 */
export function formatCurrency(amount) {
    if (amount === undefined || amount === null)
        return '';
    return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}
// ============================================================================
// GENERIC ENTITY BUILDER
// ============================================================================
/**
 * Creates a content builder from a field configuration
 */
export function createContentBuilder(entityLabel, fields) {
    return (entity) => {
        const parts = [`${entityLabel}:`];
        for (const field of fields) {
            const value = entity[field.key];
            if (value === undefined || value === null || value === '')
                continue;
            const formatted = field.formatter ? field.formatter(value) : String(value);
            if (field.label) {
                parts.push(`${field.label}: ${formatted}.`);
            }
            else {
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
//# sourceMappingURL=hook-generator.js.map