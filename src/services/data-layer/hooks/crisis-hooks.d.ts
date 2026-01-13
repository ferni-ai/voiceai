/**
 * Crisis & Support Domain Hooks
 *
 * Auto-indexing hooks for crisis episodes and support received.
 * Critical for learning how to best support the user in future crises.
 * "What helped last time?" becomes answerable.
 *
 * @module services/data-layer/hooks/crisis-hooks
 */
import type { CrisisEpisodeEntity, SupportReceivedEntity } from '../types.js';
/**
 * Called when a crisis episode is recorded
 * This is sensitive data - we remember it to provide better future support
 */
export declare const onCrisisEpisodeChange: import("../hook-generator.js").DomainHook<CrisisEpisodeEntity>;
/**
 * Called when user mentions support they received from others
 * Helps us understand their support network
 */
export declare const onSupportReceivedChange: import("../hook-generator.js").DomainHook<SupportReceivedEntity>;
//# sourceMappingURL=crisis-hooks.d.ts.map