/**
 * Store Factory - Provides the appropriate store based on environment
 *
 * This factory abstracts away the store selection logic so services
 * can simply call `getStore()` without knowing about the underlying implementation.
 */
import { getLogger } from '../utils/safe-logger.js';
import { getDefaultStore } from './in-memory-store.js';
const logger = getLogger().child({ module: 'StoreFactory' });
let storeInstance = null;
// FIX: Cache initialization promise to prevent race conditions
let initializationPromise = null;
/**
 * Get the active memory store
 *
 * Selection priority:
 * 1. Firestore (if GOOGLE_CLOUD_PROJECT is set in production)
 * 2. Postgres (if DATABASE_URL is set)
 * 3. In-memory (fallback for development)
 */
export async function getStore() {
    // Return existing instance if already initialized
    if (storeInstance) {
        return storeInstance;
    }
    // Return cached promise if initialization is in progress
    if (initializationPromise) {
        return initializationPromise;
    }
    // Start initialization and cache the promise
    initializationPromise = initializeStore();
    try {
        const store = await initializationPromise;
        return store;
    }
    finally {
        // Clear the promise cache after completion
        initializationPromise = null;
    }
}
async function initializeStore() {
    const isProduction = process.env.NODE_ENV === 'production';
    const hasGCP = Boolean(process.env.GOOGLE_CLOUD_PROJECT);
    const hasPostgres = Boolean(process.env.DATABASE_URL);
    try {
        if (isProduction && hasGCP) {
            const { getFirestoreStore } = await import('./firestore-store.js');
            storeInstance = getFirestoreStore();
            logger.info('Using Firestore store');
        }
        else if (hasPostgres) {
            const { getPostgresStore } = await import('./postgres-store.js');
            storeInstance = getPostgresStore();
            logger.info('Using Postgres store');
        }
        else {
            storeInstance = getDefaultStore();
            logger.info('Using in-memory store');
        }
    }
    catch (error) {
        logger.warn({ error: String(error) }, 'Failed to initialize preferred store, falling back to in-memory');
        storeInstance = getDefaultStore();
    }
    return storeInstance;
}
/**
 * Get store synchronously (returns null if not yet initialized)
 */
export function getStoreSync() {
    return storeInstance;
}
/**
 * Reset the store instance (useful for testing)
 */
export function resetStore() {
    storeInstance = null;
    initializationPromise = null;
}
/**
 * Initialize store with a specific instance (useful for DI)
 */
export function setStore(store) {
    storeInstance = store;
}
export default {
    getStore,
    getStoreSync,
    resetStore,
    setStore,
};
//# sourceMappingURL=store-factory.js.map