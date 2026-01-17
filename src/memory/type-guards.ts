/**
 * Type Guards and Validators for Memory Store Data
 *
 * Provides runtime validation of data from external sources (Firestore, Postgres)
 * to ensure type safety when converting from unknown types.
 */

import type {
  UserProfile,
  ConversationSummary,
  KeyMoment,
  FinancialGoal,
} from '../types/user-profile.js';

// ============================================================================
// TYPE GUARDS
// ============================================================================

/**
 * Check if a value is a non-null object
 */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Check if a value is a string
 */
function isString(value: unknown): value is string {
  return typeof value === 'string';
}

/**
 * Check if a value is a number
 */
function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !isNaN(value);
}

/**
 * Check if a value is a Date or can be converted to a valid Date
 */
function isDateLike(value: unknown): boolean {
  if (value instanceof Date) return true;
  if (typeof value === 'string') {
    const date = new Date(value);
    return !isNaN(date.getTime());
  }
  // Firestore Timestamp object
  if (isObject(value) && '_seconds' in value) return true;
  return false;
}

/**
 * Check if a value is an array of strings
 */
function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

// ============================================================================
// USER PROFILE VALIDATION
// ============================================================================

/**
 * Validate that data matches UserProfile structure
 */
export function isValidUserProfile(data: unknown): data is UserProfile {
  if (!isObject(data)) return false;

  // Required fields
  if (!isString(data.id)) return false;

  // Optional but type-checked fields
  // Note: Firestore often returns null for unset fields, so we allow null/undefined
  if ('name' in data && data.name != null && !isString(data.name)) return false;
  if ('email' in data && data.email != null && !isString(data.email)) return false;
  if ('phone' in data && data.phone != null && !isString(data.phone)) return false;

  // Date fields can be missing but if present should be date-like
  // Note: Using != null to allow both null and undefined (common in Firestore)
  const dateFields = ['firstContact', 'lastContact', 'createdAt', 'updatedAt'];
  for (const field of dateFields) {
    if (field in data && data[field] != null && !isDateLike(data[field])) return false;
  }

  return true;
}

/**
 * Convert raw data to UserProfile with validation
 * Returns null if validation fails
 */
export function parseUserProfile(data: unknown): UserProfile | null {
  if (!isValidUserProfile(data)) {
    return null;
  }
  return data;
}

// ============================================================================
// CONVERSATION SUMMARY VALIDATION
// ============================================================================

/**
 * Validate that data matches ConversationSummary structure
 */
export function isValidConversationSummary(data: unknown): data is ConversationSummary {
  if (!isObject(data)) return false;

  // Required fields
  if (!isString(data.id)) return false;

  // Array fields should be string arrays if present
  if ('mainTopics' in data && !isStringArray(data.mainTopics)) return false;
  if ('keyPoints' in data && !isStringArray(data.keyPoints)) return false;

  // String fields
  if ('emotionalArc' in data && data.emotionalArc !== undefined && !isString(data.emotionalArc))
    return false;

  return true;
}

/**
 * Convert raw data to ConversationSummary with validation
 */
export function parseConversationSummary(data: unknown): ConversationSummary | null {
  if (!isValidConversationSummary(data)) {
    return null;
  }
  return data;
}

// ============================================================================
// KEY MOMENT VALIDATION
// ============================================================================

/**
 * Validate that data matches KeyMoment structure
 */
export function isValidKeyMoment(data: unknown): data is KeyMoment {
  if (!isObject(data)) return false;

  // Required fields
  if (!isString(data.type)) return false;
  if (!isString(data.content)) return false;

  // Optional fields
  if ('id' in data && !isString(data.id)) return false;
  if ('timestamp' in data && !isDateLike(data.timestamp)) return false;
  if ('importance' in data && !isNumber(data.importance)) return false;

  return true;
}

/**
 * Convert raw data to KeyMoment with validation
 */
export function parseKeyMoment(data: unknown): KeyMoment | null {
  if (!isValidKeyMoment(data)) {
    return null;
  }
  return data;
}

// ============================================================================
// FINANCIAL GOAL VALIDATION
// ============================================================================

/**
 * Validate that data matches FinancialGoal structure
 */
export function isValidFinancialGoal(data: unknown): data is FinancialGoal {
  if (!isObject(data)) return false;

  // Required fields
  if (!isString(data.id)) return false;
  if (!isString(data.name)) return false;
  if (!isString(data.type)) return false;

  // Optional numeric fields
  if ('targetAmount' in data && data.targetAmount !== undefined && !isNumber(data.targetAmount))
    return false;
  if ('currentAmount' in data && data.currentAmount !== undefined && !isNumber(data.currentAmount))
    return false;

  return true;
}

/**
 * Convert raw data to FinancialGoal with validation
 */
export function parseFinancialGoal(data: unknown): FinancialGoal | null {
  if (!isValidFinancialGoal(data)) {
    return null;
  }
  return data;
}

// ============================================================================
// SAFE PARSE WITH FALLBACK
// ============================================================================

/**
 * Parse and hydrate data with date conversion, returning typed result.
 * Falls back to input data if parsing fails (for backwards compatibility).
 *
 * @param data - Raw data from storage
 * @param validator - Type guard function
 * @param hydrateFunc - Function to convert date strings/timestamps to Dates
 */
export function safeParse<T>(
  data: unknown,
  validator: (d: unknown) => d is T,
  hydrateFunc?: (d: T) => T
): T | null {
  if (!validator(data)) {
    return null;
  }

  if (hydrateFunc) {
    return hydrateFunc(data);
  }

  return data;
}

/**
 * Parse array of items, filtering out invalid ones
 */
export function safeParseArray<T>(
  items: unknown[],
  validator: (d: unknown) => d is T,
  hydrateFunc?: (d: T) => T
): T[] {
  return items
    .map((item) => safeParse(item, validator, hydrateFunc))
    .filter((item): item is T => item !== null);
}

export default {
  isValidUserProfile,
  isValidConversationSummary,
  isValidKeyMoment,
  isValidFinancialGoal,
  parseUserProfile,
  parseConversationSummary,
  parseKeyMoment,
  parseFinancialGoal,
  safeParse,
  safeParseArray,
};
