/**
 * User Corrections & Learning Domain Hooks
 *
 * Auto-indexing hooks for when user corrects us and preferences we infer.
 * This is how we get smarter over time - corrections are gold!
 *
 * @module services/data-layer/hooks/learning-hooks
 */
import { createDomainHook, joinNonEmpty } from '../hook-generator.js';
// ============================================================================
// USER CORRECTION HOOKS
// ============================================================================
/**
 * Called when user corrects something Ferni said
 * This is CRITICAL for improving accuracy - we never forget corrections
 */
export const onUserCorrectionChange = createDomainHook({
    entityType: 'user_correction',
    storeType: 'superhuman-intelligence',
    contentBuilder: (entity) => joinNonEmpty([
        'CORRECTION:',
        `Ferni said: "${entity.whatFerniSaid}"`,
        `User corrected: "${entity.whatUserCorrected}"`,
        `Correct info: "${entity.correctInformation}"`,
        `[${entity.category}]`,
    ]),
});
// ============================================================================
// IMPLICIT PREFERENCE HOOKS
// ============================================================================
/**
 * Called when we detect an implicit preference from user behavior
 * Example: "User always skips small talk" or "User prefers morning check-ins"
 */
export const onImplicitPreferenceChange = createDomainHook({
    entityType: 'implicit_preference',
    storeType: 'superhuman-intelligence',
    contentBuilder: (entity) => joinNonEmpty([
        `Implicit preference (${entity.category}): ${entity.preference}`,
        entity.evidence?.length ? `Evidence: ${entity.evidence.join('; ')}` : undefined,
        `Confidence: ${Math.round(entity.confidence * 100)}%`,
        entity.contradicted ? '[MAY BE OUTDATED]' : undefined,
    ]),
    shouldSkip: (entity) => {
        // Skip low-confidence preferences
        return entity.confidence < 0.5;
    },
});
//# sourceMappingURL=learning-hooks.js.map