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
import type { UserProfile } from '../../types/user-profile.js';
import { type VoiceIdInput } from './voice-id-resolver.js';
/**
 * Validation error codes for specific failure reasons.
 */
export type ValidationErrorCode = 'PERSONA_NOT_FOUND' | 'NO_VOICE_ID' | 'NO_SYSTEM_PROMPT' | 'NOT_UNLOCKED' | 'RATE_LIMITED' | 'ALREADY_WITH_AGENT' | 'INVALID_TARGET' | 'MISSING_USER_PROFILE';
/**
 * Single validation error.
 */
export interface ValidationError {
    code: ValidationErrorCode;
    message: string;
    details?: Record<string, unknown>;
    /** Whether this error is recoverable (user can retry) */
    recoverable: boolean;
    /** User-friendly message for display */
    userMessage: string;
}
/**
 * Successful validation result.
 */
export interface ValidationSuccess {
    valid: true;
    /** Canonical target persona ID */
    targetPersonaId: string;
    /** Display name for logging/UI */
    targetDisplayName: string;
    /** Resolved voice ID */
    voiceId: string;
    /** Voice ID source for debugging */
    voiceIdSource: string;
}
/**
 * Failed validation result.
 */
export interface ValidationFailure {
    valid: false;
    errors: ValidationError[];
    /** Most critical error for display */
    primaryError: ValidationError;
}
/**
 * Validation result union type.
 */
export type ValidationResult = ValidationSuccess | ValidationFailure;
/**
 * Options for pre-handoff validation.
 */
export interface ValidationOptions {
    /** User profile for unlock checks */
    userProfile?: UserProfile | null;
    /** Subscription tier override */
    subscriptionTier?: 'free' | 'friend' | 'partner';
    /** Skip unlock validation (for testing) */
    skipUnlockCheck?: boolean;
    /** Skip rate limit check */
    skipRateLimit?: boolean;
    /** Voice ID input for resolution */
    voiceIdInput?: VoiceIdInput;
    /** Session ID for session-scoped rate limiting */
    sessionId?: string;
    /**
     * CRITICAL: Current agent from session-scoped state.
     * If provided, uses this instead of global state for "already with agent" check.
     * This prevents state mismatch bugs between sessions.
     */
    currentAgent?: string;
}
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
export declare function validateHandoffPreconditions(targetAgentId: string, options?: ValidationOptions): Promise<ValidationResult>;
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
export declare function quickValidate(targetAgentId: string, sessionCurrentAgent?: string): {
    canProceed: boolean;
    reason?: string;
};
/**
 * Get user-friendly error message for validation errors.
 *
 * @param errors - Array of validation errors
 * @returns User-friendly message
 */
export declare function getValidationErrorMessage(errors: ValidationError[]): string;
/**
 * Check if validation errors are all recoverable.
 *
 * @param errors - Array of validation errors
 * @returns true if user can potentially retry
 */
export declare function areErrorsRecoverable(errors: ValidationError[]): boolean;
export default validateHandoffPreconditions;
//# sourceMappingURL=pre-validation.d.ts.map