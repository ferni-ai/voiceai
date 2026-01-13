/**
 * Insurance & Legal Domain Hooks
 *
 * Auto-indexing hooks for life admin - insurance policies and legal documents.
 * Important for "when does my policy expire?" and estate planning conversations.
 *
 * @module services/data-layer/hooks/legal-hooks
 */
import { createDomainHook, formatField, joinNonEmpty } from '../hook-generator.js';
// ============================================================================
// INSURANCE POLICY HOOKS
// ============================================================================
/**
 * Called when insurance policy information is added or updated
 */
export const onInsurancePolicyChange = createDomainHook({
    entityType: 'insurance_policy',
    storeType: 'financial',
    contentBuilder: (entity) => joinNonEmpty([
        `Insurance policy: ${entity.type} with ${entity.provider}`,
        formatField('Coverage', entity.coverage),
        entity.premium && entity.premiumFrequency
            ? `$${entity.premium}/${entity.premiumFrequency}`
            : undefined,
        formatField('Expires', entity.expiryDate),
    ]),
});
// ============================================================================
// LEGAL DOCUMENT HOOKS
// ============================================================================
/**
 * Called when legal document information is added or updated
 */
export const onLegalDocumentChange = createDomainHook({
    entityType: 'legal_document',
    storeType: 'life-data',
    contentBuilder: (entity) => joinNonEmpty([
        `Legal document: ${entity.type} - ${entity.description}`,
        `[${entity.status}]`,
        formatField('Last updated', entity.lastUpdated),
        formatField('Attorney', entity.attorney),
    ]),
});
//# sourceMappingURL=legal-hooks.js.map