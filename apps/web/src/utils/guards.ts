/**
 * Type Guards and Assertion Utilities
 *
 * Defensive programming utilities that catch bugs early and make
 * assumptions explicit in the code.
 *
 * ## Philosophy
 * - Fail fast: Catch bugs at the point of assumption, not later
 * - Make assumptions explicit: Future readers know what was expected
 * - Type narrowing: Help TypeScript prove correctness
 *
 * ## Categories
 * 1. Exhaustive checks - Ensure all cases are handled
 * 2. Runtime assertions - Verify assumptions that TypeScript can't check
 * 3. Null guards - Eliminate null/undefined safely
 * 4. Type narrowing - Help TypeScript prove types
 *
 * @module utils/guards
 */

// ============================================================================
// EXHAUSTIVE CHECKS
// ============================================================================

/**
 * Ensures exhaustive handling of discriminated unions in switch statements.
 *
 * If a new case is added to a union type, TypeScript will error at compile
 * time because `value` won't be assignable to `never`.
 *
 * @example
 * type Status = 'pending' | 'active' | 'completed';
 *
 * function handleStatus(status: Status): string {
 *   switch (status) {
 *     case 'pending': return 'Waiting...';
 *     case 'active': return 'In progress';
 *     case 'completed': return 'Done!';
 *     default:
 *       // If someone adds 'cancelled', this will error at compile time
 *       return assertNever(status);
 *   }
 * }
 */
export function assertNever(value: never, message?: string): never {
  throw new Error(message ?? `Unexpected value: ${JSON.stringify(value)}`);
}

/**
 * Like assertNever but returns a fallback value instead of throwing.
 * Use when you want to handle unknown cases gracefully in production
 * but still get compile-time errors for missing cases.
 *
 * @example
 * function getIcon(status: Status): string {
 *   switch (status) {
 *     case 'pending': return '⏳';
 *     case 'active': return '▶️';
 *     case 'completed': return '✅';
 *     default:
 *       console.warn(`Unknown status: ${status}`);
 *       return exhaustiveFallback(status, '❓');
 *   }
 * }
 */
export function exhaustiveFallback<T>(value: never, fallback: T): T {
  if (import.meta.env?.DEV) {
    console.warn(`Unhandled case: ${JSON.stringify(value)}`);
  }
  return fallback;
}

// ============================================================================
// RUNTIME ASSERTIONS
// ============================================================================

/**
 * Runtime assertion that throws if condition is false.
 * Use to document and verify assumptions that TypeScript can't check.
 *
 * @example
 * function divide(a: number, b: number): number {
 *   invariant(b !== 0, 'Division by zero');
 *   return a / b;
 * }
 *
 * @example
 * async function fetchUser(id: string): Promise<User> {
 *   const user = await db.get(id);
 *   invariant(user, `User not found: ${id}`);
 *   return user; // TypeScript now knows user is not null
 * }
 */
export function invariant(
  condition: unknown,
  message: string
): asserts condition {
  if (!condition) {
    throw new Error(`Invariant violation: ${message}`);
  }
}

/**
 * Like invariant but only throws in development.
 * In production, logs a warning but continues execution.
 *
 * Use for soft assertions where failure is unexpected but recoverable.
 *
 * @example
 * function updateCache(data: CacheData): void {
 *   softInvariant(data.version > 0, 'Cache data should have version');
 *   // Continue even if version is 0
 * }
 */
export function softInvariant(condition: unknown, message: string): void {
  if (!condition) {
    const fullMessage = `Soft invariant violation: ${message}`;
    if (import.meta.env?.DEV) {
      throw new Error(fullMessage);
    } else {
      console.warn(fullMessage);
    }
  }
}

/**
 * Assert that a value is defined (not null or undefined).
 * Returns the value with null/undefined removed from the type.
 *
 * @example
 * const element = document.getElementById('app');
 * const app = assertDefined(element, 'App element not found');
 * // app is now HTMLElement, not HTMLElement | null
 */
export function assertDefined<T>(
  value: T | null | undefined,
  message: string
): T {
  if (value === null || value === undefined) {
    throw new Error(`Assertion failed: ${message}`);
  }
  return value;
}

/**
 * Assert that a value is a specific type.
 * Useful for runtime type checking of external data.
 *
 * @example
 * const data = JSON.parse(response);
 * assertType(data, 'object', 'API response must be an object');
 */
export function assertType(
  value: unknown,
  expectedType: 'string' | 'number' | 'boolean' | 'object' | 'function',
  message: string
): void {
  const actualType = typeof value;
  if (actualType !== expectedType) {
    throw new Error(`${message}. Expected ${expectedType}, got ${actualType}`);
  }
}

// ============================================================================
// NULL GUARDS
// ============================================================================

/**
 * Returns the value if defined, otherwise throws.
 * Alias for assertDefined with a default message.
 *
 * @example
 * const config = unwrapOrThrow(getConfig(), 'Config not loaded');
 */
export function unwrapOrThrow<T>(
  value: T | null | undefined,
  message = 'Value is null or undefined'
): T {
  return assertDefined(value, message);
}

/**
 * Returns the first defined value from a list.
 * Like the nullish coalescing operator but for multiple values.
 *
 * @example
 * const name = firstDefined(user.nickname, user.name, user.email, 'Anonymous');
 */
export function firstDefined<T>(...values: (T | null | undefined)[]): T | undefined {
  for (const value of values) {
    if (value !== null && value !== undefined) {
      return value;
    }
  }
  return undefined;
}

/**
 * Filter out null and undefined from an array.
 * Returns a properly typed array without null/undefined.
 *
 * @example
 * const users = [user1, null, user2, undefined, user3];
 * const validUsers = compact(users); // User[]
 */
export function compact<T>(array: (T | null | undefined)[]): T[] {
  return array.filter((item): item is T => item !== null && item !== undefined);
}

// ============================================================================
// SAFE ARRAY ACCESS
// ============================================================================

/**
 * Safely access an array element with explicit handling of out-of-bounds.
 * Unlike normal array access, this makes the undefined case explicit.
 *
 * @example
 * const first = safeGet(items, 0);
 * if (first) {
 *   // TypeScript knows first is T, not T | undefined
 * }
 */
export function safeGet<T>(array: T[], index: number): T | undefined {
  if (index < 0 || index >= array.length) {
    return undefined;
  }
  return array[index];
}

/**
 * Get an array element or throw if not present.
 *
 * @example
 * const required = getOrThrow(items, 0, 'Items array is empty');
 */
export function getOrThrow<T>(array: T[], index: number, message: string): T {
  const value = safeGet(array, index);
  return assertDefined(value, message);
}

/**
 * Get the first element or undefined.
 */
export function first<T>(array: T[]): T | undefined {
  return array[0];
}

/**
 * Get the last element or undefined.
 */
export function last<T>(array: T[]): T | undefined {
  return array[array.length - 1];
}

// ============================================================================
// TYPE NARROWING HELPERS
// ============================================================================

/**
 * Check if a value is a non-empty string.
 */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Check if a value is a positive number.
 */
export function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && value > 0 && !Number.isNaN(value);
}

/**
 * Check if a value is a non-negative number.
 */
export function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && value >= 0 && !Number.isNaN(value);
}

/**
 * Check if a value is a valid array with items.
 */
export function isNonEmptyArray<T>(value: unknown): value is T[] {
  return Array.isArray(value) && value.length > 0;
}

/**
 * Check if a value is a plain object (not null, not array).
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

/**
 * Check if an object has a specific key.
 */
export function hasKey<K extends string>(
  obj: unknown,
  key: K
): obj is Record<K, unknown> {
  return isPlainObject(obj) && key in obj;
}

// ============================================================================
// DISCRIMINATED UNION HELPERS
// ============================================================================

/**
 * Type-safe check for discriminated unions.
 *
 * @example
 * type Event = { type: 'click'; x: number } | { type: 'keydown'; key: string };
 *
 * function handle(event: Event) {
 *   if (isType(event, 'type', 'click')) {
 *     // event.x is available
 *   }
 * }
 */
export function isType<
  T extends { [K in D]: string },
  D extends keyof T,
  V extends T[D]
>(obj: T, discriminator: D, value: V): obj is Extract<T, { [K in D]: V }> {
  return obj[discriminator] === value;
}

/**
 * Create a type guard for a specific discriminator value.
 *
 * @example
 * type Result = { status: 'success'; data: Data } | { status: 'error'; error: Error };
 *
 * const isSuccess = createTypeGuard<Result, 'status'>('status', 'success');
 * const isError = createTypeGuard<Result, 'status'>('status', 'error');
 *
 * if (isSuccess(result)) {
 *   // result.data is available
 * }
 */
export function createTypeGuard<
  T extends { [K in D]: string },
  D extends keyof T
>(discriminator: D, value: T[D]) {
  return (obj: T): obj is Extract<T, { [K in D]: typeof value }> =>
    obj[discriminator] === value;
}

// ============================================================================
// DEVELOPMENT HELPERS
// ============================================================================

/**
 * Log a deprecation warning (only in development).
 */
export function deprecated(feature: string, alternative?: string): void {
  if (import.meta.env?.DEV) {
    const message = alternative
      ? `DEPRECATED: ${feature}. Use ${alternative} instead.`
      : `DEPRECATED: ${feature}`;
    console.warn(message);
  }
}

/**
 * Mark code as unreachable. If this code is reached, it's a bug.
 */
export function unreachable(message = 'Unreachable code reached'): never {
  throw new Error(message);
}

/**
 * Mark a function as not yet implemented.
 */
export function notImplemented(feature: string): never {
  throw new Error(`Not implemented: ${feature}`);
}
