/**
 * Firestore Utilities
 *
 * Helper functions for working with Firestore.
 *
 * IMPORTANT: Firestore doesn't accept `undefined` values in documents.
 * Use `removeUndefined()` or `cleanForFirestore()` before writing.
 *
 * ARCHITECTURE NOTE:
 * This is the canonical location for Firestore utilities. All layers
 * (memory, services, tools, etc.) should import from here.
 *
 * @module utils/firestore-utils
 */

import { Firestore, FieldValue } from '@google-cloud/firestore';
import { createLogger } from './safe-logger.js';

const log = createLogger({ module: 'firestore-utils' });

/**
 * True if `value` is a Firestore `FieldValue` sentinel (serverTimestamp(),
 * increment(), arrayUnion(), arrayRemove(), delete()).
 *
 * These are opaque transform markers, not plain data: the SDK replaces them
 * with a server-side computation at write time. Rebuilding one via
 * `Object.entries()` (as a naive deep-clean would) strips its internal
 * `FieldTransform` identity and turns it into `{}`, silently losing the
 * transform.
 *
 * Checks `instanceof FieldValue` first (true for every FieldValue this
 * module's own `@google-cloud/firestore` import produces). Falls back to a
 * duck-type check — constructor name ending in "Transform" (or exactly
 * "FieldValue"), an `isEqual` method, and no own enumerable keys — for a
 * FieldValue created by a *different* copy of the package (e.g. a second
 * `@google-cloud/firestore` install hoisted elsewhere in the workspace),
 * where `instanceof` against ours would otherwise fail.
 */
function isFirestoreFieldValue(value: unknown): boolean {
  if (value === null || typeof value !== 'object') {
    return false;
  }

  if (value instanceof FieldValue) {
    return true;
  }

  // Duck-type fallback: a FieldValue minted by a *different* copy of
  // @google-cloud/firestore (e.g. a second install hoisted elsewhere in the
  // workspace) fails `instanceof` against our import of the class, but the
  // SDK's internal transform classes (ServerTimestampTransform,
  // NumericIncrementTransform, ArrayUnionTransform, ArrayRemoveTransform,
  // DeleteTransform) all extend FieldTransform -> FieldValue and expose an
  // `isEqual` method. Some carry their own data (e.g. increment's `operand`,
  // arrayUnion's elements), so this does NOT require zero own keys.
  const ctorName = (value as { constructor?: { name?: string } }).constructor?.name;
  const looksLikeTransform =
    typeof ctorName === 'string' && (ctorName === 'FieldValue' || ctorName.endsWith('Transform'));
  const hasIsEqual = typeof (value as { isEqual?: unknown }).isEqual === 'function';

  return looksLikeTransform && hasIsEqual;
}

// ============================================================================
// FIRESTORE DB INSTANCE
// ============================================================================

let db: Firestore | null = null;
let initialized = false;

// Health tracking for observability
interface DegradationEvent {
  service: string;
  timestamp: string;
  reason: string;
}

interface FirestoreHealthStatus {
  dbAvailable: boolean;
  initialized: boolean;
  initializationError: string | null;
  degradationCount: number;
  recentDegradations: DegradationEvent[];
  lastDegradationAt: string | null;
}

let initializationError: string | null = null;
let degradationCount = 0;
const recentDegradations: DegradationEvent[] = [];
const MAX_DEGRADATION_HISTORY = 20;
let lastDegradationAt: string | null = null;

/**
 * Get or initialize the Firestore database instance.
 * Returns null if Firestore is not available.
 */
export function getFirestoreDb(): Firestore | null {
  if (initialized) {
    return db;
  }

  try {
    db = new Firestore();
    initialized = true;
    initializationError = null;
    log.debug('Firestore initialized');
    return db;
  } catch (error) {
    const errorMsg = String(error);
    log.warn({ error: errorMsg }, 'Firestore not available');
    initialized = true; // Don't retry
    initializationError = errorMsg;
    return null;
  }
}

/**
 * Record when a service degrades due to Firestore unavailability.
 * Call this when services detect !db and return early.
 *
 * @param serviceName - Name of the service that degraded
 * @param reason - Why it degraded (typically 'db_unavailable')
 */
export function recordDegradation(serviceName: string, reason = 'db_unavailable'): void {
  degradationCount++;
  const timestamp = new Date().toISOString();
  lastDegradationAt = timestamp;

  const event: DegradationEvent = { service: serviceName, timestamp, reason };
  recentDegradations.unshift(event);

  // Keep history bounded
  if (recentDegradations.length > MAX_DEGRADATION_HISTORY) {
    recentDegradations.pop();
  }

  log.warn(
    { service: serviceName, reason, totalDegradations: degradationCount },
    `Service degraded: ${serviceName} falling back to empty results`
  );
}

/**
 * Get health status for Firestore connection.
 * Used by health endpoints.
 */
export function getFirestoreHealth(): FirestoreHealthStatus {
  return {
    dbAvailable: db !== null,
    initialized,
    initializationError,
    degradationCount,
    recentDegradations: [...recentDegradations],
    lastDegradationAt,
  };
}

/**
 * Reset the Firestore instance (for testing).
 */
export function resetFirestoreInstance(): void {
  db = null;
  initialized = false;
  initializationError = null;
  degradationCount = 0;
  recentDegradations.length = 0;
  lastDegradationAt = null;
}

// ============================================================================
// DATA CLEANING UTILITIES
// ============================================================================

/**
 * Remove undefined values from an object (Firestore doesn't accept undefined)
 *
 * @example
 * ```typescript
 * await docRef.set(removeUndefined({
 *   name: user.name,
 *   email: user.email,
 *   phone: user.phone, // might be undefined - will be filtered out
 * }));
 * ```
 */
export function removeUndefined<T extends object>(obj: T): T {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result as T;
}

/**
 * Deep remove undefined values from an object (recursive)
 *
 * Use this when you have nested objects that might contain undefined values.
 *
 * @example
 * ```typescript
 * await docRef.set(deepRemoveUndefined({
 *   user: {
 *     name: 'John',
 *     settings: {
 *       theme: undefined, // will be removed
 *       lang: 'en',
 *     }
 *   }
 * }));
 * ```
 */
export function deepRemoveUndefined<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => deepRemoveUndefined(item)) as T;
  }

  // Only plain objects are walked: Dates, Timestamps, FieldValues (vectors,
  // serverTimestamp) and references pass through as they are. Walking them
  // turned each into an empty plain object.
  if (typeof obj === 'object' && isPlainObject(obj)) {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (value !== undefined) {
        result[key] = deepRemoveUndefined(value);
      }
    }
    return result as T;
  }

  return obj;
}

function isPlainObject(value: object): boolean {
  const proto = Object.getPrototypeOf(value) as unknown;
  return proto === Object.prototype || proto === null;
}

/**
 * Make a string safe to use as a single Firestore document ID path segment.
 *
 * Firestore document IDs:
 *  - must not contain a forward slash (it is the path separator — a name
 *    like `doc(id)` built from free text that happens to contain "/" fails
 *    with "Value for argument ... must point to a document, but was ...
 *    Your path does not contain an even number of components.")
 *  - must not be exactly "." or ".."
 *  - must not be empty
 *  - must be at most 1500 bytes (UTF-8)
 *
 * Free text used to build ids — an extracted fact's key, an entity name, a
 * quoted phrase — can violate all of these. This maps any input to a safe
 * id deterministically (the same input always produces the same output),
 * so callers that read an id back or dedupe on it don't need a lookup
 * table.
 */
export function sanitizeFirestoreDocId(input: string): string {
  const MAX_BYTES = 1400; // comfortably under Firestore's 1500-byte limit
  let safe = (input ?? '').replace(/\//g, '-').trim();

  if (safe === '.' || safe === '..') {
    safe = safe.replace(/\./g, '_dot_');
  }
  if (safe.length === 0) {
    safe = '_';
  }
  if (Buffer.byteLength(safe, 'utf8') > MAX_BYTES) {
    safe = Buffer.from(safe, 'utf8').subarray(0, MAX_BYTES).toString('utf8');
  }
  return safe;
}

/**
 * Clean an object for Firestore by:
 * 1. Removing undefined values
 * 2. Converting Date objects to ISO strings
 * 3. Handling nested objects recursively
 *
 * This is the safest way to prepare data for Firestore writes.
 *
 * @example
 * ```typescript
 * await docRef.set(cleanForFirestore({
 *   name: user.name,
 *   createdAt: new Date(),
 *   metadata: {
 *     source: undefined, // removed
 *     version: 1,
 *   }
 * }));
 * ```
 */
export function cleanForFirestore<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (obj instanceof Date) {
    return obj.toISOString() as T;
  }

  // Preserve Firestore Timestamps - they have a toDate() method
  // This prevents converting them to plain objects with _seconds/_nanoseconds
  if (
    typeof obj === 'object' &&
    'toDate' in obj &&
    typeof (obj as { toDate: unknown }).toDate === 'function'
  ) {
    return obj;
  }

  // Preserve FieldValue sentinels (serverTimestamp(), increment(), etc.) by
  // identity - rebuilding one via Object.entries() below would silently
  // turn it into a plain `{}` and lose the server-side transform.
  if (isFirestoreFieldValue(obj)) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => cleanForFirestore(item)) as T;
  }

  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (value !== undefined) {
        result[key] = cleanForFirestore(value);
      }
    }
    return result as T;
  }

  return obj;
}

// ============================================================================
// DATE CONVERSION UTILITIES
// ============================================================================

/**
 * Safely convert a Firestore field to a JavaScript Date.
 *
 * Handles all common formats:
 * - Firestore Timestamp (has .toDate() method)
 * - JavaScript Date objects
 * - ISO 8601 date strings
 * - Unix timestamps (number)
 * - Serialized Firestore Timestamps ({seconds, nanoseconds} or {_seconds, _nanoseconds})
 *
 * @param value - The value to convert
 * @param fallback - Fallback date if conversion fails (defaults to now)
 * @returns A JavaScript Date object
 *
 * @example
 * ```typescript
 * const data = doc.data();
 * const contact = {
 *   ...data,
 *   createdAt: toSafeDate(data.createdAt),
 *   lastInteraction: toSafeDate(data.lastInteraction, new Date(0)),
 * };
 * ```
 */
export function toSafeDate(value: unknown, fallback: Date = new Date()): Date {
  if (!value) return fallback;

  // Already a Date
  if (value instanceof Date) return value;

  // Firestore Timestamp (has toDate method)
  if (
    typeof value === 'object' &&
    'toDate' in value &&
    typeof (value as { toDate: unknown }).toDate === 'function'
  ) {
    return (value as { toDate: () => Date }).toDate();
  }

  // Plain object with seconds (serialized via .toJSON())
  if (typeof value === 'object' && value !== null && 'seconds' in value) {
    const obj = value as { seconds: number; nanoseconds?: number };
    return new Date(obj.seconds * 1000 + (obj.nanoseconds ?? 0) / 1000000);
  }

  // Plain object with _seconds (serialized via JSON.stringify)
  if (typeof value === 'object' && value !== null && '_seconds' in value) {
    const obj = value as { _seconds: number; _nanoseconds?: number };
    return new Date(obj._seconds * 1000 + (obj._nanoseconds ?? 0) / 1000000);
  }

  // ISO string or numeric timestamp
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    if (!isNaN(parsed.getTime())) return parsed;
  }

  return fallback;
}

/**
 * Safely convert a Firestore field to a JavaScript Date, returning undefined if null/undefined.
 *
 * @param value - The value to convert
 * @returns A JavaScript Date object, or undefined
 *
 * @example
 * ```typescript
 * const data = doc.data();
 * const contact = {
 *   ...data,
 *   deletedAt: toSafeDateOptional(data.deletedAt), // undefined if not set
 * };
 * ```
 */
export function toSafeDateOptional(value: unknown): Date | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  return toSafeDate(value);
}
