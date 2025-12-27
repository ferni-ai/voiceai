/**
 * Safe Firestore Operations
 *
 * ALWAYS use these functions instead of direct Firestore writes!
 * They automatically clean undefined values and convert Dates.
 *
 * Problem:
 * - Firestore rejects `undefined` values with cryptic errors
 * - Direct `.set()`, `.update()`, `.add()` calls can fail silently or crash
 *
 * Solution:
 * - This module wraps all Firestore writes with `cleanForFirestore()`
 * - Use `safeSet()`, `safeUpdate()`, `safeAdd()` instead of raw methods
 *
 * @example
 * ```typescript
 * // ❌ WRONG - can fail if data has undefined values
 * await db.collection('users').doc(userId).set(userData);
 *
 * // ✅ CORRECT - automatically cleans data
 * await safeSet(db.collection('users').doc(userId), userData);
 *
 * // Or use the helper:
 * const safeDb = getSafeFirestore();
 * await safeDb.users(userId).set(userData);
 * ```
 *
 * @module utils/safe-firestore
 */

import type {
  Firestore,
  DocumentReference,
  CollectionReference,
  SetOptions,
  DocumentData,
} from '@google-cloud/firestore';
import { cleanForFirestore } from './firestore-utils.js';
import { createLogger } from './safe-logger.js';

const log = createLogger({ module: 'SafeFirestore' });

// ============================================================================
// SAFE WRITE OPERATIONS
// ============================================================================

/**
 * Safely set a document, cleaning undefined values and converting Dates.
 *
 * @example
 * ```typescript
 * await safeSet(docRef, {
 *   name: user.name,
 *   email: user.email,     // Will be removed if undefined
 *   phone: user.phone,     // Will be removed if undefined
 *   createdAt: new Date(), // Will be converted to ISO string
 * });
 * ```
 */
export async function safeSet<T extends DocumentData>(
  docRef: DocumentReference<T>,
  data: T,
  options?: SetOptions
): Promise<void> {
  const cleanData = cleanForFirestore(data);
  log.debug({ path: docRef.path, hasOptions: !!options }, 'Safe set');

  if (options) {
    await docRef.set(cleanData, options);
  } else {
    await docRef.set(cleanData);
  }
}

/**
 * Safely update a document, cleaning undefined values.
 *
 * Note: Unlike set(), update() only modifies specified fields.
 * Undefined values will be removed (not written as null).
 *
 * @example
 * ```typescript
 * await safeUpdate(docRef, {
 *   name: 'New Name',
 *   email: undefined,      // Will NOT update email field
 *   updatedAt: new Date(), // Will be converted to ISO string
 * });
 * ```
 */
export async function safeUpdate<T extends DocumentData>(
  docRef: DocumentReference<T>,
  data: Partial<T>
): Promise<void> {
  const cleanData = cleanForFirestore(data);
  log.debug({ path: docRef.path }, 'Safe update');
  await docRef.update(cleanData);
}

/**
 * Safely add a document to a collection, cleaning undefined values.
 *
 * @example
 * ```typescript
 * const docRef = await safeAdd(collection, {
 *   name: 'New Item',
 *   createdAt: new Date(),
 *   metadata: undefined,  // Will be removed
 * });
 * ```
 */
export async function safeAdd<T extends DocumentData>(
  collectionRef: CollectionReference<T>,
  data: T
): Promise<DocumentReference<T>> {
  const cleanData = cleanForFirestore(data);
  log.debug({ path: collectionRef.path }, 'Safe add');
  return collectionRef.add(cleanData);
}

// ============================================================================
// SAFE BATCH OPERATIONS
// ============================================================================

/**
 * Create a safe batch writer that cleans all data before writing.
 *
 * @example
 * ```typescript
 * const batch = createSafeBatch(db);
 * batch.set(doc1, userData1);
 * batch.set(doc2, userData2);
 * batch.update(doc3, { status: 'active' });
 * await batch.commit();
 * ```
 */
export function createSafeBatch(db: Firestore) {
  const batch = db.batch();

  return {
    set<T extends DocumentData>(docRef: DocumentReference<T>, data: T, options?: SetOptions) {
      const cleanData = cleanForFirestore(data);
      if (options) {
        batch.set(docRef, cleanData, options);
      } else {
        batch.set(docRef, cleanData);
      }
      return this;
    },

    update<T extends DocumentData>(docRef: DocumentReference<T>, data: Partial<T>) {
      const cleanData = cleanForFirestore(data);
      // Cast to UpdateData since cleanForFirestore removes undefined values
      batch.update(docRef, cleanData as FirebaseFirestore.UpdateData<T>);
      return this;
    },

    delete(docRef: DocumentReference) {
      batch.delete(docRef);
      return this;
    },

    async commit() {
      log.debug('Committing safe batch');
      await batch.commit();
    },
  };
}

// ============================================================================
// HELPER FUNCTION TO GET FIRESTORE WITH SAFE DEFAULTS
// ============================================================================

/**
 * Get the Firestore instance.
 * Use with safeSet/safeUpdate/safeAdd for write operations.
 */
export async function getFirestoreInstance(): Promise<Firestore | null> {
  try {
    // Dynamic import to avoid circular dependencies
    const { getFirestoreDb } = await import('../services/superhuman/firestore-utils.js');
    return getFirestoreDb();
  } catch {
    log.warn('Could not get Firestore instance');
    return null;
  }
}

// ============================================================================
// COMMON COLLECTION HELPERS
// ============================================================================

/**
 * Common Firestore collection paths for Ferni.
 * Use these constants to avoid typos and ensure consistency.
 */
export const COLLECTIONS = {
  USERS: 'bogle_users',
  CONTACTS: (userId: string) => `bogle_users/${userId}/contacts`,
  CONTACT_RELATIONSHIPS: (userId: string) => `bogle_users/${userId}/contact_relationships`,
  PREFERENCES: (userId: string) => `bogle_users/${userId}/preferences`,
  MEMORIES: (userId: string) => `bogle_users/${userId}/memories`,
  HABITS: (userId: string) => `bogle_users/${userId}/habits`,
  HABIT_COMPLETIONS: (userId: string) => `bogle_users/${userId}/habit_completions`,
  CONVERSATIONS: (userId: string) => `bogle_users/${userId}/conversations`,
  TASKS: 'tasks',
  SYSTEM_CACHE: 'system_cache',
} as const;

// Re-export cleanForFirestore for direct use
export { cleanForFirestore } from './firestore-utils.js';
