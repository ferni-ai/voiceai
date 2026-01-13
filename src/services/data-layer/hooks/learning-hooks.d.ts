/**
 * User Corrections & Learning Domain Hooks
 *
 * Auto-indexing hooks for when user corrects us and preferences we infer.
 * This is how we get smarter over time - corrections are gold!
 *
 * @module services/data-layer/hooks/learning-hooks
 */
import type { UserCorrectionEntity, ImplicitPreferenceEntity } from '../types.js';
/**
 * Called when user corrects something Ferni said
 * This is CRITICAL for improving accuracy - we never forget corrections
 */
export declare const onUserCorrectionChange: import("../hook-generator.js").DomainHook<UserCorrectionEntity>;
/**
 * Called when we detect an implicit preference from user behavior
 * Example: "User always skips small talk" or "User prefers morning check-ins"
 */
export declare const onImplicitPreferenceChange: import("../hook-generator.js").DomainHook<ImplicitPreferenceEntity>;
//# sourceMappingURL=learning-hooks.d.ts.map