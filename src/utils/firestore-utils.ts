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

import { Firestore } from '@google-cloud/firestore';
import { createLogger } from './safe-logger.js';

const log = createLogger({ module: 'firestore-utils' });

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

  if (typeof obj === 'object') {
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
 * - Serialized Firestore Timestamps ({seconds, nanoseconds})
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

  // Plain object with seconds (serialized Firestore Timestamp)
  if (typeof value === 'object' && 'seconds' in value) {
    const { seconds } = value as { seconds: number };
    return new Date(seconds * 1000);
  }

  // ISO string or numeric timestamp
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    if (!isNaN(parsed.getTime())) return parsed;
  }

  return fallback;
}
