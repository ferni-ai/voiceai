/**
 * Zod Validation Schemas (Frontend)
 *
 * Runtime validation schemas for API responses and user input.
 * Use at system boundaries where TypeScript's compile-time checks aren't enough.
 *
 * ## Philosophy
 * - Trust internal code, validate external data
 * - Infer types from schemas (single source of truth)
 * - Fail fast with clear error messages
 *
 * ## Pattern: Schema-First Types
 * ```typescript
 * // 1. Define schema (source of truth)
 * const UserSchema = z.object({
 *   id: z.string(),
 *   email: z.string().email(),
 *   name: z.string().min(1),
 * });
 *
 * // 2. Infer type from schema (never write types manually!)
 * type User = z.infer<typeof UserSchema>;
 *
 * // 3. Validate at boundary
 * const result = UserSchema.safeParse(apiResponse);
 * if (result.success) {
 *   const user: User = result.data; // Fully typed!
 * }
 * ```
 *
 * ## When to Use Schemas
 * - API response validation
 * - Form input validation
 * - URL parameter parsing
 * - localStorage/sessionStorage reads
 * - External service responses
 *
 * ## When NOT to Use Schemas
 * - Internal function parameters (TypeScript is enough)
 * - State that never leaves your control
 * - Performance-critical paths (validation has overhead)
 *
 * @module types/schemas
 */

import { z } from 'zod';

// ============================================================================
// PRIMITIVE SCHEMAS
// ============================================================================

/**
 * Non-empty string - use for required text fields
 */
export const NonEmptyString = z.string().min(1, 'Cannot be empty');

/**
 * Email address with validation
 */
export const Email = z.string().email('Invalid email address');

/**
 * URL with validation
 */
export const Url = z.string().url('Invalid URL');

/**
 * Positive number (> 0)
 */
export const PositiveNumber = z.number().positive('Must be positive');

/**
 * Non-negative number (>= 0)
 */
export const NonNegativeNumber = z.number().nonnegative('Cannot be negative');

/**
 * Percentage validation (0-100)
 * Note: For branded Percentage type, use from branded.ts
 */
export const PercentageSchema = z.number().min(0).max(100);

/**
 * Normalized score (0-1)
 */
export const NormalizedScore = z.number().min(0).max(1);

// ============================================================================
// ID VALIDATION SCHEMAS
// ============================================================================
// Note: For type-safe branded IDs, use types from branded.ts instead.
// These schemas are for runtime validation at API boundaries.

/**
 * User ID validation schema
 *
 * @example
 * const result = UserIdSchema.safeParse(input);
 * if (result.success) {
 *   const userId = createUserId(result.data); // Convert to branded type
 * }
 */
export const UserIdSchema = z.string().min(1);

/**
 * Session ID validation schema
 */
export const SessionIdSchema = z.string().min(1);

/**
 * Persona ID validation schema
 */
export const PersonaIdSchema = z.enum([
  'ferni',
  'maya',
  'peter',
  'alex',
  'jordan',
  'nayan',
  'jackie',
  'bogle',
]);

// ============================================================================
// API RESPONSE SCHEMAS
// ============================================================================

/**
 * Standard API response wrapper
 *
 * @example
 * const UserResponseSchema = ApiResponse(UserSchema);
 * const response = await apiGet<z.infer<typeof UserResponseSchema>>('/api/user');
 */
export const ApiResponse = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    ok: z.boolean(),
    data: dataSchema.optional(),
    error: z.string().optional(),
    status: z.number(),
  });

/**
 * Paginated list response
 */
export const PaginatedResponse = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    items: z.array(itemSchema),
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    totalItems: z.number().int().nonnegative(),
    hasMore: z.boolean(),
  });

// ============================================================================
// TOKEN RESPONSE SCHEMAS
// ============================================================================

/**
 * LiveKit token response validation schema
 *
 * Note: For the interface type, use TokenResponse from livekit.ts
 * This schema is for runtime validation of API responses.
 */
export const LiveKitTokenSchema = z.object({
  accessToken: z.string(),
  url: z.string().url(),
  agentName: z.string().optional(),
  version: z.string().optional(),
});

// ============================================================================
// USER SCHEMAS
// ============================================================================

/**
 * User profile schema
 */
export const UserProfileSchema = z.object({
  id: z.string(),
  email: Email.optional(),
  displayName: z.string().optional(),
  photoUrl: Url.optional(),
  createdAt: z.coerce.date(),
  subscription: z.object({
    tier: z.enum(['free', 'friend', 'partner']),
    status: z.enum(['active', 'trialing', 'canceled', 'past_due']),
  }).optional(),
});

export type UserProfile = z.infer<typeof UserProfileSchema>;

// ============================================================================
// HEALTH DATA SCHEMAS
// ============================================================================

/**
 * Health status schema
 */
export const HealthStatusSchema = z.object({
  connected: z.boolean(),
  lastSync: z.coerce.date().optional(),
  dataTypes: z.array(z.string()).optional(),
});

export type HealthStatus = z.infer<typeof HealthStatusSchema>;

/**
 * Health data point schema
 */
export const HealthDataPointSchema = z.object({
  type: z.string(),
  value: z.number(),
  unit: z.string(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  source: z.string().optional(),
});

export type HealthDataPoint = z.infer<typeof HealthDataPointSchema>;

// ============================================================================
// FORM VALIDATION SCHEMAS
// ============================================================================

/**
 * Contact form schema
 */
export const ContactFormSchema = z.object({
  name: NonEmptyString,
  email: Email,
  message: z.string().min(10, 'Message must be at least 10 characters'),
  subject: z.string().optional(),
});

export type ContactFormData = z.infer<typeof ContactFormSchema>;

/**
 * Settings form schema
 */
export const SettingsFormSchema = z.object({
  displayName: z.string().max(50).optional(),
  timezone: z.string().optional(),
  language: z.string().default('en'),
  notifications: z.object({
    email: z.boolean().default(true),
    push: z.boolean().default(true),
    sms: z.boolean().default(false),
  }).optional(),
});

export type SettingsFormData = z.infer<typeof SettingsFormSchema>;

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Parse with user-friendly error messages
 *
 * @example
 * try {
 *   const user = parseWithErrors(UserSchema, apiResponse, 'User data');
 * } catch (error) {
 *   // Error message: "User data: email: Invalid email address"
 * }
 */
export function parseWithErrors<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
  context: string
): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const errors = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join(', ');
    throw new Error(`${context}: ${errors}`);
  }
  return result.data;
}

/**
 * Safe parse that returns a Result type
 *
 * @example
 * const result = safeValidate(UserSchema, apiResponse);
 * if (result.ok) {
 *   console.log(result.value.name);
 * } else {
 *   console.error(result.error);
 * }
 */
export function safeValidate<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { ok: true; value: T } | { ok: false; error: z.ZodError } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { ok: true, value: result.data };
  }
  return { ok: false, error: result.error };
}

/**
 * Validate and transform to our Result type
 *
 * @example
 * import { Result, ok, err } from './result.js';
 *
 * function parseUser(data: unknown): Result<User, ValidationError> {
 *   return validateToResult(UserSchema, data);
 * }
 */
export function validateToResult<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { ok: true; value: T } | { ok: false; error: string } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { ok: true, value: result.data };
  }
  const errorMessage = result.error.issues
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('; ');
  return { ok: false, error: errorMessage };
}

// ============================================================================
// URL PARAMETER SCHEMAS
// ============================================================================

/**
 * Parse URL search params with validation
 *
 * @example
 * const ParamsSchema = z.object({
 *   page: z.coerce.number().int().positive().default(1),
 *   limit: z.coerce.number().int().min(1).max(100).default(20),
 * });
 *
 * const params = parseSearchParams(ParamsSchema, window.location.search);
 */
export function parseSearchParams<T extends z.ZodRawShape>(
  schema: z.ZodObject<T>,
  searchString: string
): z.infer<z.ZodObject<T>> {
  const params = new URLSearchParams(searchString);
  const obj: Record<string, string> = {};
  for (const [key, value] of params.entries()) {
    obj[key] = value;
  }
  return schema.parse(obj);
}

// ============================================================================
// LOCAL STORAGE SCHEMAS
// ============================================================================

/**
 * Safe read from localStorage with schema validation
 *
 * @example
 * const PreferencesSchema = z.object({
 *   theme: z.enum(['light', 'dark']).default('light'),
 *   volume: z.number().min(0).max(1).default(0.8),
 * });
 *
 * const prefs = readLocalStorage(PreferencesSchema, 'user_preferences');
 */
export function readLocalStorage<T>(
  schema: z.ZodSchema<T>,
  key: string,
  defaultValue?: T
): T | undefined {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return defaultValue;
    const parsed = JSON.parse(raw);
    const result = schema.safeParse(parsed);
    return result.success ? result.data : defaultValue;
  } catch {
    return defaultValue;
  }
}

/**
 * Write to localStorage with schema validation
 *
 * @example
 * writeLocalStorage(PreferencesSchema, 'user_preferences', { theme: 'dark', volume: 0.5 });
 */
export function writeLocalStorage<T>(
  schema: z.ZodSchema<T>,
  key: string,
  value: T
): boolean {
  try {
    const validated = schema.parse(value);
    localStorage.setItem(key, JSON.stringify(validated));
    return true;
  } catch {
    return false;
  }
}
