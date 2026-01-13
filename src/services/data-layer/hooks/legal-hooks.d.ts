/**
 * Insurance & Legal Domain Hooks
 *
 * Auto-indexing hooks for life admin - insurance policies and legal documents.
 * Important for "when does my policy expire?" and estate planning conversations.
 *
 * @module services/data-layer/hooks/legal-hooks
 */
import type { InsurancePolicyEntity, LegalDocumentEntity } from '../types.js';
/**
 * Called when insurance policy information is added or updated
 */
export declare const onInsurancePolicyChange: import("../hook-generator.js").DomainHook<InsurancePolicyEntity>;
/**
 * Called when legal document information is added or updated
 */
export declare const onLegalDocumentChange: import("../hook-generator.js").DomainHook<LegalDocumentEntity>;
//# sourceMappingURL=legal-hooks.d.ts.map