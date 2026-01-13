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
export type { RevelationType, RevelationMoment, RevelationProfile, CapabilityCategory, ThrottleRule, SurveillanceCategory, LanguagePattern, PermissionCategory, PermissionPrompt, } from './types.js';
export { DEFAULT_THROTTLE_RULES, createEmptyRevelationProfile, revelationToCategory, getRevelationName, } from './types.js';
export { loadRevelationProfile, saveRevelationProfile, recordRevelation, hasRevelation, getRevelations, recordCapabilityUse, getCapabilityUseCount, getSessionCapabilities, recordRevelationResponse, getRevelationStats, clearRevelationCache, clearAllRevelationCache, } from './storage.js';
export { canUseCapability, shouldHoldBack, useCapability, isFirstRevelation, getAvailableRevelations, getThrottleState, } from './throttling.js';
export { SURVEILLANCE_PATTERNS, HUMAN_ALTERNATIVES, detectSurveillanceLanguage, containsBlockingSurveillance, getSurveillanceIssues, humanizeSurveillanceLanguage, getAntiSurveillanceGuidance, getAntiSurveillanceReminder, } from './anti-surveillance.js';
export { PERMISSION_PROMPTS, getPermissionPrompt, getPromptForCapability, requiresPermission, getPermissionGuidance, PERMISSION_GRANTED_RESPONSES, PERMISSION_DECLINED_RESPONSES, getPermissionGrantedResponse, getPermissionDeclinedResponse, } from './permission-prompts.js';
import type { CapabilityCategory } from './types.js';
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
export declare function checkCapabilityUsage(userId: string, sessionId: string, capability: CapabilityCategory, context: {
    sessionNumber: number;
    trustLevel?: number;
}): Promise<{
    canUse: boolean;
    reason?: string;
    isFirstTime: boolean;
    needsPermission: boolean;
    permissionPrompt?: string;
    shouldHoldBack: boolean;
}>;
/**
 * Record that we used a capability (call after successful use)
 */
export declare function recordCapabilityUsage(userId: string, sessionId: string, capability: CapabilityCategory, personaId: string, context?: string): Promise<void>;
/**
 * Check if a response contains surveillance language
 */
export declare function validateResponse(response: string): {
    valid: boolean;
    issues: Array<{
        severity: 'block' | 'warn';
        match: string;
        alternative?: string;
    }>;
};
//# sourceMappingURL=index.d.ts.map