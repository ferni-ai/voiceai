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
import { Firestore, } from '@google-cloud/firestore';
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
export async function safeSet(docRef, data, options) {
    const cleanData = cleanForFirestore(data);
    log.debug({ path: docRef.path, hasOptions: !!options }, 'Safe set');
    if (options) {
        await docRef.set(cleanData, options);
    }
    else {
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
export async function safeUpdate(docRef, data) {
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
export async function safeAdd(collectionRef, data) {
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
export function createSafeBatch(db) {
    const batch = db.batch();
    return {
        set(docRef, data, options) {
            const cleanData = cleanForFirestore(data);
            if (options) {
                batch.set(docRef, cleanData, options);
            }
            else {
                batch.set(docRef, cleanData);
            }
            return this;
        },
        update(docRef, data) {
            const cleanData = cleanForFirestore(data);
            // Cast to UpdateData since cleanForFirestore removes undefined values
            batch.update(docRef, cleanData);
            return this;
        },
        delete(docRef) {
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
// CENTRALIZED FIRESTORE GETTER
// ============================================================================
let cachedDb = null;
let initialized = false;
/**
 * Get the shared Firestore instance (synchronous).
 *
 * MIGRATION: Use this instead of importing from 'firebase-admin/firestore'
 *
 * @example
 * ```typescript
 * // ❌ OLD - scattered imports
 * import { getFirestore } from 'firebase-admin/firestore';
 * const db = getFirestore();
 *
 * // ✅ NEW - centralized with error handling
 * import { getDb } from '../utils/safe-firestore.js';
 * const db = getDb();
 * if (!db) { log.warn('Firestore unavailable'); return; }
 * ```
 */
export function getDb() {
    if (initialized) {
        return cachedDb;
    }
    try {
        // Use @google-cloud/firestore directly for better typing
        cachedDb = new Firestore();
        initialized = true;
        log.debug('Firestore instance initialized');
        return cachedDb;
    }
    catch (error) {
        log.warn({ error: String(error) }, 'Firestore not available');
        initialized = true; // Don't retry
        return null;
    }
}
/**
 * Get the Firestore instance (async version for backward compatibility).
 * Use with safeSet/safeUpdate/safeAdd for write operations.
 *
 * @deprecated Use getDb() instead
 */
export async function getFirestoreInstance() {
    return getDb();
}
/**
 * Reset the Firestore instance (for testing).
 */
export function resetFirestoreInstance() {
    cachedDb = null;
    initialized = false;
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
    CONTACTS: (userId) => `bogle_users/${userId}/contacts`,
    CONTACT_RELATIONSHIPS: (userId) => `bogle_users/${userId}/contact_relationships`,
    PREFERENCES: (userId) => `bogle_users/${userId}/preferences`,
    MEMORIES: (userId) => `bogle_users/${userId}/memories`,
    HABITS: (userId) => `bogle_users/${userId}/habits`,
    HABIT_COMPLETIONS: (userId) => `bogle_users/${userId}/habit_completions`,
    CONVERSATIONS: (userId) => `bogle_users/${userId}/conversations`,
    TASKS: 'tasks',
    SYSTEM_CACHE: 'system_cache',
};
// Re-export cleanForFirestore for direct use
export { cleanForFirestore } from './firestore-utils.js';
//# sourceMappingURL=safe-firestore.js.map