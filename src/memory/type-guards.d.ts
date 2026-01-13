/**
 * Type Guards and Validators for Memory Store Data
 *
 * Provides runtime validation of data from external sources (Firestore, Postgres)
 * to ensure type safety when converting from unknown types.
 */
import type { UserProfile, ConversationSummary, KeyMoment, FinancialGoal } from '../types/user-profile.js';
/**
 * Validate that data matches UserProfile structure
 */
export declare function isValidUserProfile(data: unknown): data is UserProfile;
/**
 * Convert raw data to UserProfile with validation
 * Returns null if validation fails
 */
export declare function parseUserProfile(data: unknown): UserProfile | null;
/**
 * Validate that data matches ConversationSummary structure
 */
export declare function isValidConversationSummary(data: unknown): data is ConversationSummary;
/**
 * Convert raw data to ConversationSummary with validation
 */
export declare function parseConversationSummary(data: unknown): ConversationSummary | null;
/**
 * Validate that data matches KeyMoment structure
 */
export declare function isValidKeyMoment(data: unknown): data is KeyMoment;
/**
 * Convert raw data to KeyMoment with validation
 */
export declare function parseKeyMoment(data: unknown): KeyMoment | null;
/**
 * Validate that data matches FinancialGoal structure
 */
export declare function isValidFinancialGoal(data: unknown): data is FinancialGoal;
/**
 * Convert raw data to FinancialGoal with validation
 */
export declare function parseFinancialGoal(data: unknown): FinancialGoal | null;
/**
 * Parse and hydrate data with date conversion, returning typed result.
 * Falls back to input data if parsing fails (for backwards compatibility).
 *
 * @param data - Raw data from storage
 * @param validator - Type guard function
 * @param hydrateFunc - Function to convert date strings/timestamps to Dates
 */
export declare function safeParse<T>(data: unknown, validator: (d: unknown) => d is T, hydrateFunc?: (d: T) => T): T | null;
/**
 * Parse array of items, filtering out invalid ones
 */
export declare function safeParseArray<T>(items: unknown[], validator: (d: unknown) => d is T, hydrateFunc?: (d: T) => T): T[];
declare const _default: {
    isValidUserProfile: typeof isValidUserProfile;
    isValidConversationSummary: typeof isValidConversationSummary;
    isValidKeyMoment: typeof isValidKeyMoment;
    isValidFinancialGoal: typeof isValidFinancialGoal;
    parseUserProfile: typeof parseUserProfile;
    parseConversationSummary: typeof parseConversationSummary;
    parseKeyMoment: typeof parseKeyMoment;
    parseFinancialGoal: typeof parseFinancialGoal;
    safeParse: typeof safeParse;
    safeParseArray: typeof safeParseArray;
};
export default _default;
//# sourceMappingURL=type-guards.d.ts.map