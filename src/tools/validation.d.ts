/**
 * Input Validation Utilities
 *
 * Provides sanitization and validation for user-provided data
 * to prevent injection attacks and API misuse.
 */
/**
 * Validate email address format
 */
export declare function isValidEmail(email: string): boolean;
/**
 * Sanitize email for logging (mask domain)
 */
export declare function sanitizeEmailForLog(email: string): string;
/**
 * Validate phone number format (E.164 or common formats)
 */
export declare function isValidPhone(phone: string): boolean;
/**
 * Normalize phone to E.164 format
 */
export declare function normalizePhone(phone: string): string | null;
/**
 * Sanitize phone for logging (mask middle digits)
 */
export declare function sanitizePhoneForLog(phone: string): string;
/**
 * Validate stock ticker symbol
 */
export declare function isValidStockSymbol(symbol: string): boolean;
/**
 * Normalize stock symbol
 */
export declare function normalizeStockSymbol(symbol: string): string | null;
/**
 * Sanitize text input to prevent injection attacks
 */
export declare function sanitizeText(text: string, maxLength?: number): string;
/**
 * Sanitize for plain text output (no HTML escaping needed)
 */
export declare function sanitizePlainText(text: string, maxLength?: number): string;
/**
 * Validate URL format
 */
export declare function isValidUrl(url: string): boolean;
/**
 * Validate and parse monetary amount
 */
export declare function parseAmount(input: string | number): number | null;
/**
 * Validate amount is within reasonable bounds
 */
export declare function isValidAmount(amount: number, min?: number, max?: number): boolean;
/**
 * Parse and validate date string
 */
export declare function parseDate(input: string): Date | null;
export interface ValidationResult {
    valid: boolean;
    error?: string;
    sanitized?: unknown;
}
/**
 * Validate email with result object
 */
export declare function validateEmail(email: string): ValidationResult;
/**
 * Validate phone with result object
 */
export declare function validatePhone(phone: string): ValidationResult;
/**
 * Validate stock symbol with result object
 */
export declare function validateStockSymbol(symbol: string): ValidationResult;
/**
 * Validate a string field (title, name, etc.)
 * Used by: alex-team-handlers, maya-team-handlers
 */
export declare function validateStringField(value: unknown, fieldName: string, options?: {
    minLength?: number;
    maxLength?: number;
    required?: boolean;
}): ValidationResult & {
    sanitized?: string;
};
/**
 * Validate event title (alias for validateStringField)
 * Used by: alex-team-handlers
 */
export declare function validateEventTitle(title: unknown): ValidationResult & {
    sanitized?: string;
};
/**
 * Validate goal name (alias for validateStringField)
 * Used by: maya-team-handlers
 */
export declare function validateGoalName(name: unknown): ValidationResult & {
    sanitized?: string;
};
/**
 * Validate a date field with options
 * Used by: alex-team-handlers (events), maya-team-handlers (deadlines)
 */
export declare function validateDateField(date: unknown, options?: {
    required?: boolean;
    allowPast?: boolean;
    fieldName?: string;
}): ValidationResult & {
    sanitized?: Date;
};
/**
 * Validate event date (must be provided)
 * Used by: alex-team-handlers
 */
export declare function validateEventDate(date: unknown): ValidationResult & {
    sanitized?: Date;
};
/**
 * Validate deadline (optional, cannot be in the past)
 * Used by: maya-team-handlers
 */
export declare function validateDeadline(deadline: unknown): ValidationResult & {
    sanitized?: Date;
};
/**
 * Validate reminder days array
 * Used by: alex-team-handlers
 */
export declare function validateReminderDays(days: unknown, defaults?: number[]): ValidationResult & {
    sanitized?: number[];
};
/**
 * Validate monetary amount with bounds
 * Used by: maya-team-handlers
 */
export declare function validateMonetaryAmount(amount: unknown, options?: {
    fieldName?: string;
    min?: number;
    max?: number;
    required?: boolean;
}): ValidationResult & {
    sanitized?: number;
};
//# sourceMappingURL=validation.d.ts.map