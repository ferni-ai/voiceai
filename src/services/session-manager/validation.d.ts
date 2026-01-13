/**
 * Session Validation Utilities
 *
 * Validates user IDs and session parameters.
 *
 * @module session-manager/validation
 */
/**
 * Validate userId format before profile operations
 * Returns the validated userId or undefined if invalid
 */
export declare function validateUserId(id: string | undefined): string | undefined;
/**
 * Type guard for valid user ID
 */
export declare function isValidUserId(id: string | undefined): id is string;
//# sourceMappingURL=validation.d.ts.map