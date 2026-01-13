/**
 * Pre-Handoff Validation
 *
 * Validates all required data exists before executing a handoff.
 * Fail fast if anything is missing - don't start a handoff that will fail.
 *
 * Validation checks:
 * 1. Target persona exists and is loadable
 * 2. Voice ID can be resolved
 * 3. System prompt exists
 * 4. User has access (unlock status)
 * 5. Rate limiting not exceeded
 *
 * @module handoff/pre-validation
 */
import { isCoreTeamMember, isTeamMemberUnlocked, } from '../../intelligence/context-builders/team/team-availability.js';
import { isCoach } from '../../personas/persona-ids.js';
import { getCanonicalPersonaId, getPersonaDisplayName } from '../../personas/voice-registry.js';
import { getLogger } from '../../utils/safe-logger.js';
import { getCurrentAgent, isHandoffAllowed, isSameAgent } from './state.js';
import { canResolveVoiceId, resolveVoiceId } from './voice-id-resolver.js';
const log = getLogger();
// ============================================================================
// VALIDATION IMPLEMENTATION
// ============================================================================
/**
 * Validate all preconditions before executing a handoff.
 *
 * This function should be called BEFORE any handoff execution.
 * It checks all required data exists and the user has access.
 *
 * @param targetAgentId - The target persona to hand off to
 * @param options - Validation options including user profile
 * @returns Validation result with success data or error details
 *
 * @example
 * ```typescript
 * const validation = await validateHandoffPreconditions('peter-john', {
 *   userProfile,
 *   subscriptionTier: 'friend',
 * });
 *
 * if (!validation.valid) {
 *   // Don't proceed - show error to user
 *   showError(validation.primaryError.userMessage);
 *   return;
 * }
 *
 * // Safe to proceed
 * await executeHandoff(validation.targetPersonaId);
 * ```
 */
export async function validateHandoffPreconditions(targetAgentId, options = {}) {
    const errors = [];
    const { userProfile, subscriptionTier = 'free', skipUnlockCheck = false, skipRateLimit = false, voiceIdInput, currentAgent: sessionCurrentAgent, // Use session state if provided
     } = options;
    // Get canonical ID
    const canonicalId = getCanonicalPersonaId(targetAgentId);
    const displayName = getPersonaDisplayName(canonicalId);
    log.debug({ targetAgentId, canonicalId, displayName }, '🔍 Starting handoff pre-validation');
    // ========================================================================
    // CHECK 1: Valid target (not empty, not invalid)
    // ========================================================================
    if (!canonicalId || canonicalId === 'unknown' || canonicalId === '') {
        errors.push({
            code: 'INVALID_TARGET',
            message: `Invalid handoff target: ${targetAgentId}`,
            details: { targetAgentId },
            recoverable: false,
            userMessage: "I don't recognize that team member.",
        });
    }
    // ========================================================================
    // CHECK 2: Not already with this agent
    // CRITICAL FIX: Use session-scoped current agent if provided, else fall back to global state.
    // This prevents state mismatch bugs where global state is stale from a previous session.
    // ========================================================================
    const currentAgent = sessionCurrentAgent || getCurrentAgent();
    if (canonicalId && isSameAgent(currentAgent, canonicalId)) {
        errors.push({
            code: 'ALREADY_WITH_AGENT',
            message: `Already with ${displayName}`,
            details: { currentAgent, targetAgent: canonicalId },
            recoverable: false,
            userMessage: `You're already talking to ${displayName}!`,
        });
    }
    // ========================================================================
    // CHECK 3: Rate limiting
    // ========================================================================
    if (!skipRateLimit && !isHandoffAllowed()) {
        errors.push({
            code: 'RATE_LIMITED',
            message: 'Handoff rate limited - too soon after last handoff',
            details: { debounceMs: 800 }, // From HANDOFF_TIMING.DEBOUNCE_MS
            recoverable: true,
            userMessage: 'Give me just a moment before switching again.',
        });
    }
    // ========================================================================
    // CHECK 4: Team unlock status
    // ========================================================================
    if (!skipUnlockCheck && canonicalId && !isCoach(canonicalId)) {
        const tier = subscriptionTier;
        if (isCoreTeamMember(canonicalId)) {
            const isUnlocked = isTeamMemberUnlocked(canonicalId, userProfile || null, tier);
            log.debug({
                personaId: canonicalId,
                tier,
                isUnlocked,
                hasProfile: !!userProfile,
                profileTier: userProfile?.subscription?.tier,
                bypassEnv: process.env['BYPASS_TEAM_UNLOCKS'],
            }, '🔓 Team unlock check');
            if (!isUnlocked) {
                errors.push({
                    code: 'NOT_UNLOCKED',
                    message: `${displayName} is not yet unlocked for this user`,
                    details: { personaId: canonicalId, tier, hasProfile: !!userProfile },
                    recoverable: true, // User can upgrade or build relationship
                    userMessage: `${displayName} isn't available yet. Keep talking to me to unlock more team members!`,
                });
            }
        }
    }
    // ========================================================================
    // CHECK 5: Voice ID resolution
    // ========================================================================
    const voiceInput = voiceIdInput || {
        personaId: canonicalId,
        persona: { id: canonicalId },
    };
    const voiceResult = resolveVoiceId(voiceInput, { logLevel: 'debug' });
    if (!voiceResult.success) {
        errors.push({
            code: 'NO_VOICE_ID',
            message: voiceResult.error,
            details: {
                personaId: canonicalId,
                attemptedSources: voiceResult.attemptedSources,
            },
            recoverable: false,
            userMessage: `I'm having trouble connecting to ${displayName}. Let me stay with you for now.`,
        });
    }
    // ========================================================================
    // RESULT
    // ========================================================================
    if (errors.length > 0) {
        // Sort errors by severity (non-recoverable first)
        const sortedErrors = [...errors].sort((a, b) => {
            if (a.recoverable === b.recoverable)
                return 0;
            return a.recoverable ? 1 : -1;
        });
        log.warn({
            targetPersonaId: canonicalId,
            errorCount: errors.length,
            errors: errors.map((e) => ({ code: e.code, message: e.message })),
        }, '❌ Handoff pre-validation FAILED');
        return {
            valid: false,
            errors: sortedErrors,
            primaryError: sortedErrors[0],
        };
    }
    log.info({
        targetPersonaId: canonicalId,
        displayName,
        voiceId: voiceResult.success ? voiceResult.voiceId : 'N/A',
        voiceIdSource: voiceResult.success ? voiceResult.source : 'N/A',
    }, '✅ Handoff pre-validation PASSED');
    return {
        valid: true,
        targetPersonaId: canonicalId,
        targetDisplayName: displayName,
        voiceId: voiceResult.success ? voiceResult.voiceId : '',
        voiceIdSource: voiceResult.success ? voiceResult.source : 'unknown',
    };
}
/**
 * Quick validation check (synchronous, less thorough).
 *
 * Use this for UI feedback before making async calls.
 * Full validation should still be called before execution.
 *
 * @param targetAgentId - Target persona ID
 * @param sessionCurrentAgent - Optional: current agent from session state (preferred over global state)
 * @returns Quick validation result
 */
export function quickValidate(targetAgentId, sessionCurrentAgent) {
    const canonicalId = getCanonicalPersonaId(targetAgentId);
    // CRITICAL FIX: Use session state if provided, else fall back to global
    const currentAgent = sessionCurrentAgent || getCurrentAgent();
    // Check 1: Valid target
    if (!canonicalId || canonicalId === 'unknown') {
        return { canProceed: false, reason: 'Invalid target' };
    }
    // Check 2: Not already with agent
    if (isSameAgent(currentAgent, canonicalId)) {
        return { canProceed: false, reason: 'Already with this agent' };
    }
    // Check 3: Rate limiting
    if (!isHandoffAllowed()) {
        return { canProceed: false, reason: 'Rate limited' };
    }
    // Check 4: Voice ID available
    if (!canResolveVoiceId({ personaId: canonicalId })) {
        return { canProceed: false, reason: 'No voice ID' };
    }
    return { canProceed: true };
}
/**
 * Get user-friendly error message for validation errors.
 *
 * @param errors - Array of validation errors
 * @returns User-friendly message
 */
export function getValidationErrorMessage(errors) {
    if (errors.length === 0) {
        return 'Something went wrong. Please try again.';
    }
    // Return primary error's user message
    return errors[0].userMessage;
}
/**
 * Check if validation errors are all recoverable.
 *
 * @param errors - Array of validation errors
 * @returns true if user can potentially retry
 */
export function areErrorsRecoverable(errors) {
    return errors.every((e) => e.recoverable);
}
// ============================================================================
// EXPORTS
// ============================================================================
export default validateHandoffPreconditions;
//# sourceMappingURL=pre-validation.js.map