/**
 * Error Humanizer
 *
 * Translates technical errors into human-friendly explanations
 * that Ferni can use to communicate with users.
 *
 * "Better than human" means explaining what went wrong in a way
 * that's warm, honest, and reassuring.
 */
export interface HumanizedError {
    /** What Ferni says to the user */
    userMessage: string;
    /** Technical details for logging */
    technicalSummary: string;
    /** Severity level */
    severity: 'minor' | 'moderate' | 'major';
    /** Whether the user should be notified */
    shouldNotifyUser: boolean;
    /** Suggested recovery action */
    recoveryHint?: string;
}
/**
 * Convert a technical error into a human-friendly explanation
 */
export declare function humanizeError(error: Error | string): HumanizedError;
/**
 * Get a recovery message based on context
 */
export declare function getRecoveryMessage(context: {
    wasInConversation: boolean;
    lastUserMessage?: string;
    errorType: string;
}): string;
//# sourceMappingURL=error-humanizer.d.ts.map