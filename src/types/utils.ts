/**
 * Type Utilities
 *
 * Common utility types for the Ferni codebase.
 * These help write safer, more expressive TypeScript.
 *
 * @module types/utils
 */

// ============================================================================
// DEEP UTILITIES
// ============================================================================

/**
 * Makes all properties in T and nested objects optional.
 *
 * @example
 * interface User { name: string; address: { city: string } }
 * type PartialUser = DeepPartial<User>
 * // { name?: string; address?: { city?: string } }
 */
export type DeepPartial<T> = T extends object
  ? {
      [P in keyof T]?: DeepPartial<T[P]>;
    }
  : T;

/**
 * Makes all properties in T and nested objects readonly.
 *
 * @example
 * interface Config { api: { url: string } }
 * type FrozenConfig = DeepReadonly<Config>
 * // All properties are readonly, even nested ones
 */
export type DeepReadonly<T> = T extends object
  ? {
      readonly [P in keyof T]: DeepReadonly<T[P]>;
    }
  : T;

/**
 * Makes all properties in T and nested objects required (non-optional).
 *
 * @example
 * interface Partial { name?: string; address?: { city?: string } }
 * type Complete = DeepRequired<Partial>
 * // { name: string; address: { city: string } }
 */
export type DeepRequired<T> = T extends object
  ? {
      [P in keyof T]-?: DeepRequired<T[P]>;
    }
  : T;

// ============================================================================
// NULLABILITY UTILITIES
// ============================================================================

/**
 * Removes null and undefined from T
 */
export type NonNullable<T> = T extends null | undefined ? never : T;

/**
 * Makes a type nullable (can be T, null, or undefined)
 */
export type Nullable<T> = T | null | undefined;

/**
 * Makes a type only nullable with null (not undefined)
 */
export type NullableOnly<T> = T | null;

/**
 * Makes a type only nullable with undefined (not null)
 */
export type Optional<T> = T | undefined;

// ============================================================================
// OBJECT UTILITIES
// ============================================================================

/**
 * Pick properties from T where the value extends V
 *
 * @example
 * interface User { name: string; age: number; email: string }
 * type StringFields = PickByValue<User, string>
 * // { name: string; email: string }
 */
export type PickByValue<T, V> = Pick<
  T,
  {
    [K in keyof T]: T[K] extends V ? K : never;
  }[keyof T]
>;

/**
 * Omit properties from T where the value extends V
 */
export type OmitByValue<T, V> = Pick<
  T,
  {
    [K in keyof T]: T[K] extends V ? never : K;
  }[keyof T]
>;

/**
 * Make specific keys optional
 *
 * @example
 * interface User { id: string; name: string; email: string }
 * type UserInput = PartialBy<User, 'id'>
 * // { id?: string; name: string; email: string }
 */
export type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/**
 * Make specific keys required
 */
export type RequiredBy<T, K extends keyof T> = Omit<T, K> & Required<Pick<T, K>>;

/**
 * Get keys of T that have type V
 */
export type KeysOfType<T, V> = {
  [K in keyof T]: T[K] extends V ? K : never;
}[keyof T];

/**
 * Get all keys of T as a union of string literals
 */
export type KeysOf<T> = keyof T & string;

/**
 * Get all values of T as a union
 */
export type ValuesOf<T> = T[keyof T];

// ============================================================================
// FUNCTION UTILITIES
// ============================================================================

/**
 * Get the return type of an async function
 *
 * @example
 * async function fetchUser(): Promise<User> { ... }
 * type User = AsyncReturnType<typeof fetchUser>
 */
export type AsyncReturnType<T extends (...args: unknown[]) => Promise<unknown>> = T extends (
  ...args: unknown[]
) => Promise<infer R>
  ? R
  : never;

/**
 * Get the first parameter type of a function
 */
export type FirstParameter<T extends (...args: unknown[]) => unknown> = T extends (
  first: infer P,
  ...args: unknown[]
) => unknown
  ? P
  : never;

/**
 * A function that can be called with arguments and returns a value
 */
export type AnyFunction = (...args: unknown[]) => unknown;

/**
 * A function that returns a promise
 */
export type AsyncFunction = (...args: unknown[]) => Promise<unknown>;

// ============================================================================
// ARRAY UTILITIES
// ============================================================================

/**
 * Get the element type of an array
 *
 * @example
 * type Users = User[]
 * type User = ArrayElement<Users>
 */
export type ArrayElement<T> = T extends ReadonlyArray<infer E> ? E : never;

/**
 * A non-empty array (at least one element)
 */
export type NonEmptyArray<T> = [T, ...T[]];

/**
 * Check if a value is a non-empty array
 */
export function isNonEmptyArray<T>(arr: T[]): arr is NonEmptyArray<T> {
  return arr.length > 0;
}

// ============================================================================
// STRING UTILITIES
// ============================================================================

/**
 * A non-empty string type (branded)
 */
declare const nonEmptyStringBrand: unique symbol;
export type NonEmptyString = string & { readonly [nonEmptyStringBrand]: true };

/**
 * Check if a string is non-empty
 */
export function isNonEmptyString(value: unknown): value is NonEmptyString {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Assert a string is non-empty (throws if empty)
 */
export function assertNonEmptyString(value: string, name = 'value'): NonEmptyString {
  if (!isNonEmptyString(value)) {
    throw new Error(`${name} must be a non-empty string`);
  }
  return value as NonEmptyString;
}

// ============================================================================
// UNION UTILITIES
// ============================================================================

/**
 * Extract the union member that matches a condition
 *
 * @example
 * type Events = { type: 'click'; x: number } | { type: 'key'; key: string }
 * type ClickEvent = ExtractUnion<Events, { type: 'click' }>
 * // { type: 'click'; x: number }
 */
export type ExtractUnion<T, U> = T extends U ? T : never;

/**
 * Exclude union members that match a condition
 */
export type ExcludeUnion<T, U> = T extends U ? never : T;

// ============================================================================
// JSON UTILITIES
// ============================================================================

/**
 * Types that can be serialized to JSON
 */
export type JsonPrimitive = string | number | boolean | null;
export type JsonArray = JsonValue[];
export interface JsonObject {
  [key: string]: JsonValue;
}
export type JsonValue = JsonPrimitive | JsonArray | JsonObject;

/**
 * Convert a type to its JSON-serializable equivalent
 * (Date becomes string, functions are removed, etc.)
 */
export type Jsonify<T> = T extends Date
  ? string
  : T extends AnyFunction
    ? never
    : T extends object
      ? { [K in keyof T as T[K] extends AnyFunction ? never : K]: Jsonify<T[K]> }
      : T;

// ============================================================================
// LITERAL UTILITIES
// ============================================================================

/**
 * Create a string literal type from a const array
 *
 * @example
 * const STAGES = ['draft', 'review', 'published'] as const
 * type Stage = ElementOf<typeof STAGES> // 'draft' | 'review' | 'published'
 */
export type ElementOf<T extends readonly unknown[]> = T[number];

// ============================================================================
// ASSERTION UTILITIES
// ============================================================================

/**
 * Assert that a value is not null or undefined
 */
export function assertDefined<T>(value: T | null | undefined, name = 'value'): T {
  if (value === null || value === undefined) {
    throw new Error(`${name} must be defined`);
  }
  return value;
}

/**
 * Assert that a condition is true
 */
export function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

/**
 * Exhaustive check - ensures all cases in a union are handled
 *
 * @example
 * type Status = 'active' | 'inactive'
 * function handle(status: Status) {
 *   switch (status) {
 *     case 'active': return 1
 *     case 'inactive': return 0
 *     default: return exhaustiveCheck(status) // Type error if cases missing
 *   }
 * }
 */
export function exhaustiveCheck(value: never): never {
  throw new Error(`Unhandled value: ${JSON.stringify(value)}`);
}

// ============================================================================
// DISCRIMINATED UNION HELPERS
// ============================================================================

/**
 * Create a tagged/discriminated union type
 *
 * @example
 * type Result = Tagged<'success', { data: string }> | Tagged<'error', { message: string }>
 * // { tag: 'success'; data: string } | { tag: 'error'; message: string }
 */
export type Tagged<Tag extends string, T extends object = object> = { tag: Tag } & T;

/**
 * Type guard for tagged unions
 */
export function hasTag<T extends { tag: string }, Tag extends T['tag']>(
  value: T,
  tag: Tag
): value is Extract<T, { tag: Tag }> {
  return value.tag === tag;
}

// ============================================================================
// TIMESTAMP UTILITIES
// ============================================================================

/**
 * Branded timestamp type (milliseconds since epoch)
 */
declare const timestampBrand: unique symbol;
export type Timestamp = number & { readonly [timestampBrand]: true };

/**
 * Create a timestamp from Date or current time
 */
export function createTimestamp(date?: Date): Timestamp {
  return (date?.getTime() ?? Date.now()) as Timestamp;
}

/**
 * Convert timestamp to Date
 */
export function timestampToDate(timestamp: Timestamp): Date {
  return new Date(timestamp);
}

// ============================================================================
// OBJECT HELPERS
// ============================================================================

/**
 * Type-safe Object.keys
 */
export function typedKeys<T extends object>(obj: T): Array<keyof T> {
  return Object.keys(obj) as Array<keyof T>;
}

/**
 * Type-safe Object.entries
 */
export function typedEntries<T extends object>(obj: T): Array<[keyof T, T[keyof T]]> {
  return Object.entries(obj) as Array<[keyof T, T[keyof T]]>;
}

/**
 * Type-safe Object.fromEntries
 */
export function typedFromEntries<K extends string, V>(entries: Array<[K, V]>): Record<K, V> {
  return Object.fromEntries(entries) as Record<K, V>;
}

/**
 * Pick specific keys from an object with type safety
 */
export function pick<T extends object, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> {
  const result = {} as Pick<T, K>;
  for (const key of keys) {
    if (key in obj) {
      result[key] = obj[key];
    }
  }
  return result;
}

/**
 * Omit specific keys from an object with type safety
 */
export function omit<T extends object, K extends keyof T>(obj: T, keys: K[]): Omit<T, K> {
  const result = { ...obj };
  for (const key of keys) {
    delete (result as Record<K, unknown>)[key];
  }
  return result as Omit<T, K>;
}

// ============================================================================
// CONDITIONAL UTILITIES
// ============================================================================

/**
 * Type that is T if Condition is true, else U
 */
export type If<Condition extends boolean, T, U> = Condition extends true ? T : U;

/**
 * Check if two types are equal
 */
export type Equals<T, U> = [T] extends [U] ? ([U] extends [T] ? true : false) : false;
