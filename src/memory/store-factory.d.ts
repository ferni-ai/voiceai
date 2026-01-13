/**
 * Store Factory - Provides the appropriate store based on environment
 *
 * This factory abstracts away the store selection logic so services
 * can simply call `getStore()` without knowing about the underlying implementation.
 */
import type { MemoryStore } from './store.js';
/**
 * Get the active memory store
 *
 * Selection priority:
 * 1. Firestore (if GOOGLE_CLOUD_PROJECT is set in production)
 * 2. Postgres (if DATABASE_URL is set)
 * 3. In-memory (fallback for development)
 */
export declare function getStore(): Promise<MemoryStore>;
/**
 * Get store synchronously (returns null if not yet initialized)
 */
export declare function getStoreSync(): MemoryStore | null;
/**
 * Reset the store instance (useful for testing)
 */
export declare function resetStore(): void;
/**
 * Initialize store with a specific instance (useful for DI)
 */
export declare function setStore(store: MemoryStore): void;
declare const _default: {
    getStore: typeof getStore;
    getStoreSync: typeof getStoreSync;
    resetStore: typeof resetStore;
    setStore: typeof setStore;
};
export default _default;
//# sourceMappingURL=store-factory.d.ts.map