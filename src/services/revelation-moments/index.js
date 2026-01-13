/**
 * Revelation Moments System
 *
 * > "The capability is felt, not explained."
 *
 * This system ensures Ferni feels like a friend who notices,
 * not an app that tracks. It manages:
 *
 * 1. **Revelation Tracking** - When users first experience capabilities
 * 2. **Capability Throttling** - Spacing out impressive moments
 * 3. **Anti-Surveillance Filter** - Blocking tracking-sounding language
 * 4. **Permission Prompts** - Asking before going deep
 *
 * ## Philosophy
 *
 * - Show, don't tell - Demonstrate capabilities naturally
 * - Earn the right to go deep - Depth is earned through relationship
 * - Make them feel known, not tracked - Observations, not statistics
 * - One perfect moment > multiple mediocre ones
 *
 * ## Usage
 *
 * ```typescript
 * import {
 *   canUseCapability,
 *   recordRevelation,
 *   containsBlockingSurveillance,
 *   getPromptForCapability,
 * } from './revelation-moments/index.js';
 *
 * // Check if we can use a capability
 * const { allowed, reason } = await canUseCapability(
 *   userId, sessionId, 'pattern', { sessionNumber: 5 }
 * );
 *
 * // Record a first-time revelation
 * await recordRevelation(userId, {
 *   type: 'first_pattern_notice',
 *   sessionId,
 *   personaId: 'ferni',
 *   context: 'Noticed they often mention work stress on Mondays',
 * });
 *
 * // Check for surveillance language
 * if (containsBlockingSurveillance(response)) {
 *   // Rewrite or flag the response
 * }
 *
 * // Get permission prompt before going deep
 * const prompt = getPromptForCapability('challenge', trustLevel);
 * ```
 *
 * @module services/revelation-moments
 */
export { DEFAULT_THROTTLE_RULES, createEmptyRevelationProfile, revelationToCategory, getRevelationName, } from './types.js';
// Storage
export { loadRevelationProfile, saveRevelationProfile, recordRevelation, hasRevelation, getRevelations, recordCapabilityUse, getCapabilityUseCount, getSessionCapabilities, recordRevelationResponse, getRevelationStats, clearRevelationCache, clearAllRevelationCache, } from './storage.js';
// Throttling
export { canUseCapability, shouldHoldBack, useCapability, isFirstRevelation, getAvailableRevelations, getThrottleState, } from './throttling.js';
// Anti-Surveillance
export { SURVEILLANCE_PATTERNS, HUMAN_ALTERNATIVES, detectSurveillanceLanguage, containsBlockingSurveillance, getSurveillanceIssues, humanizeSurveillanceLanguage, getAntiSurveillanceGuidance, getAntiSurveillanceReminder, } from './anti-surveillance.js';
// Permission Prompts
export { PERMISSION_PROMPTS, getPermissionPrompt, getPromptForCapability, requiresPermission, getPermissionGuidance, PERMISSION_GRANTED_RESPONSES, PERMISSION_DECLINED_RESPONSES, getPermissionGrantedResponse, getPermissionDeclinedResponse, } from './permission-prompts.js';
// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================
import { canUseCapability, shouldHoldBack, useCapability, isFirstRevelation, } from './throttling.js';
import { getSurveillanceIssues } from './anti-surveillance.js';
import { getPromptForCapability, requiresPermission } from './permission-prompts.js';
import { recordRevelation } from './storage.js';
/**
 * All-in-one check: Can we use this capability right now?
 *
 * Checks:
 * - Throttle limits
 * - Session limits
 * - Trust requirements
 * - Whether we should hold back
 *
 * Returns guidance on what to do.
 */
export async function checkCapabilityUsage(userId, sessionId, capability, context) {
    // Check basic throttle
    const throttleResult = await canUseCapability(userId, sessionId, capability, context);
    if (!throttleResult.allowed) {
        return {
            canUse: false,
            reason: throttleResult.reason,
            isFirstTime: false,
            needsPermission: false,
            shouldHoldBack: false,
        };
    }
    // Check if we should hold back
    const holdBack = await shouldHoldBack(userId, sessionId, capability);
    if (holdBack) {
        return {
            canUse: false,
            reason: 'Already showed multiple capabilities this session',
            isFirstTime: false,
            needsPermission: false,
            shouldHoldBack: true,
        };
    }
    // Check if this is a first revelation
    const revelationType = getFirstRevelationType(capability);
    const firstTime = revelationType ? await isFirstRevelation(userId, revelationType) : false;
    // Check if permission is needed
    const needsPermission = requiresPermission(capability, context.trustLevel ?? 0);
    const permissionPrompt = needsPermission
        ? (getPromptForCapability(capability, context.trustLevel) ?? undefined)
        : undefined;
    return {
        canUse: true,
        isFirstTime: firstTime,
        needsPermission,
        permissionPrompt,
        shouldHoldBack: false,
    };
}
/**
 * Record that we used a capability (call after successful use)
 */
export async function recordCapabilityUsage(userId, sessionId, capability, personaId, context) {
    // Record the use for throttling
    await useCapability(userId, sessionId, capability);
    // Check if this is a first revelation
    const revelationType = getFirstRevelationType(capability);
    if (revelationType) {
        const isFirst = await isFirstRevelation(userId, revelationType);
        if (isFirst && context) {
            await recordRevelation(userId, {
                type: revelationType,
                sessionId,
                personaId,
                context,
            });
        }
    }
}
/**
 * Check if a response contains surveillance language
 */
export function validateResponse(response) {
    const result = getSurveillanceIssues(response);
    return {
        valid: !result.hasBlocking,
        issues: result.issues,
    };
}
// ============================================================================
// HELPERS
// ============================================================================
/**
 * Map capability category to its "first" revelation type
 */
function getFirstRevelationType(capability) {
    const mapping = {
        memory: 'first_callback',
        pattern: 'first_pattern_notice',
        anticipation: 'first_anticipation',
        growth: 'first_growth_reflection',
        challenge: 'first_gentle_challenge',
        synthesis: 'first_life_arc',
        team: 'first_team_handoff',
    };
    return mapping[capability];
}
//# sourceMappingURL=index.js.map