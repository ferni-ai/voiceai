/**
 * Firestore Life Automation Adapter
 *
 * Shared Firestore operations for Life Automation domain stores:
 * - subscriptions
 * - documents
 * - meals
 * - workflows
 *
 * Document structure: /users/{userId}/life_automation/{domain}
 *
 * Features:
 * - Lazy initialization (connects on first use)
 * - Graceful degradation (falls back to empty data if Firestore unavailable)
 * - User data isolation
 * - Automatic data cleaning for Firestore compatibility
 *
 * @module services/stores/firestore-life-adapter
 */
import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb, cleanForFirestore, recordDegradation, } from '../../utils/firestore-utils.js';
const log = createLogger({ module: 'firestore-life-adapter' });
// ============================================================================
// CONSTANTS
// ============================================================================
const LIFE_AUTOMATION_COLLECTION = 'life_automation';
// ============================================================================
// CORE OPERATIONS
// ============================================================================
/**
 * Get the document reference for a user's life automation domain data
 */
function getDocRef(db, userId, domain) {
    return db
        .collection('users')
        .doc(userId)
        .collection(LIFE_AUTOMATION_COLLECTION)
        .doc(domain);
}
/**
 * Get data for a specific life automation domain
 * Returns null if Firestore is unavailable or data doesn't exist
 */
export async function getLifeAutomationData(userId, domain) {
    const db = getFirestoreDb();
    if (!db) {
        recordDegradation('firestore-life-adapter', `getLifeAutomationData:${domain}`);
        log.warn({ userId, domain }, 'Firestore unavailable, returning null');
        return null;
    }
    try {
        const docRef = getDocRef(db, userId, domain);
        const doc = await docRef.get();
        if (!doc.exists) {
            log.debug({ userId, domain }, 'No data found, will use defaults');
            return null;
        }
        const data = doc.data();
        log.debug({ userId, domain }, 'Data loaded from Firestore');
        return data;
    }
    catch (error) {
        log.error({ error: String(error), userId, domain }, 'Failed to get life automation data');
        recordDegradation('firestore-life-adapter', `getLifeAutomationData:${domain}:error`);
        return null;
    }
}
/**
 * Save data for a specific life automation domain
 * Uses merge to avoid overwriting unrelated fields
 */
export async function saveLifeAutomationData(userId, domain, data) {
    const db = getFirestoreDb();
    if (!db) {
        recordDegradation('firestore-life-adapter', `saveLifeAutomationData:${domain}`);
        log.warn({ userId, domain }, 'Firestore unavailable, data not persisted');
        return { success: false, error: 'Firestore unavailable' };
    }
    try {
        const docRef = getDocRef(db, userId, domain);
        const cleanedData = cleanForFirestore(data);
        await docRef.set(cleanedData, { merge: true });
        log.debug({ userId, domain }, 'Data saved to Firestore');
        return { success: true };
    }
    catch (error) {
        const errorMsg = String(error);
        log.error({ error: errorMsg, userId, domain }, 'Failed to save life automation data');
        return { success: false, error: errorMsg };
    }
}
/**
 * Delete data for a specific life automation domain
 */
export async function deleteLifeAutomationData(userId, domain) {
    const db = getFirestoreDb();
    if (!db) {
        recordDegradation('firestore-life-adapter', `deleteLifeAutomationData:${domain}`);
        return { success: false, error: 'Firestore unavailable' };
    }
    try {
        const docRef = getDocRef(db, userId, domain);
        await docRef.delete();
        log.info({ userId, domain }, 'Data deleted from Firestore');
        return { success: true };
    }
    catch (error) {
        const errorMsg = String(error);
        log.error({ error: errorMsg, userId, domain }, 'Failed to delete life automation data');
        return { success: false, error: errorMsg };
    }
}
/**
 * Check if Firestore is available
 * Use this to decide whether to use Firestore or fallback to in-memory
 */
export function isFirestoreAvailable() {
    return getFirestoreDb() !== null;
}
/**
 * Batch save multiple domains at once (for migrations or bulk updates)
 */
export async function batchSaveLifeAutomationData(userId, domains) {
    const db = getFirestoreDb();
    if (!db) {
        recordDegradation('firestore-life-adapter', 'batchSaveLifeAutomationData');
        return { success: false, error: 'Firestore unavailable' };
    }
    try {
        const batch = db.batch();
        for (const { domain, data } of domains) {
            const docRef = getDocRef(db, userId, domain);
            const cleanedData = cleanForFirestore(data);
            batch.set(docRef, cleanedData, { merge: true });
        }
        await batch.commit();
        log.info({ userId, domainCount: domains.length }, 'Batch saved life automation data');
        return { success: true };
    }
    catch (error) {
        const errorMsg = String(error);
        log.error({ error: errorMsg, userId }, 'Failed to batch save life automation data');
        return { success: false, error: errorMsg };
    }
}
/**
 * Get all life automation data for a user (for exports or migrations)
 */
export async function getAllLifeAutomationData(userId) {
    const db = getFirestoreDb();
    const result = {
        subscriptions: null,
        documents: null,
        meals: null,
        workflows: null,
    };
    if (!db) {
        recordDegradation('firestore-life-adapter', 'getAllLifeAutomationData');
        return result;
    }
    const domains = ['subscriptions', 'documents', 'meals', 'workflows'];
    try {
        const promises = domains.map(async (domain) => {
            const data = await getLifeAutomationData(userId, domain);
            return { domain, data };
        });
        const results = await Promise.all(promises);
        for (const { domain, data } of results) {
            result[domain] = data;
        }
        return result;
    }
    catch (error) {
        log.error({ error: String(error), userId }, 'Failed to get all life automation data');
        return result;
    }
}
// ============================================================================
// MIGRATION UTILITIES
// ============================================================================
/**
 * Migrate data from in-memory storage to Firestore
 * Used during the transition from Map-based to Firestore-based storage
 */
export async function migrateToFirestore(userId, domain, inMemoryData) {
    // Check if data already exists in Firestore
    const existingData = await getLifeAutomationData(userId, domain);
    if (existingData) {
        log.info({ userId, domain }, 'Data already exists in Firestore, skipping migration');
        return { success: true };
    }
    // Save in-memory data to Firestore
    const result = await saveLifeAutomationData(userId, domain, inMemoryData);
    if (result.success) {
        log.info({ userId, domain }, 'Successfully migrated data to Firestore');
    }
    return result;
}
/**
 * Check if user has any life automation data in Firestore
 */
export async function hasLifeAutomationData(userId) {
    const db = getFirestoreDb();
    if (!db) {
        return false;
    }
    const domains = ['subscriptions', 'documents', 'meals', 'workflows'];
    for (const domain of domains) {
        const data = await getLifeAutomationData(userId, domain);
        if (data) {
            return true;
        }
    }
    return false;
}
//# sourceMappingURL=firestore-life-adapter.js.map