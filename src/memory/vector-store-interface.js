/**
 * Vector Store Interface
 *
 * Unified interface for vector storage implementations.
 * Allows swapping between in-memory, Firestore, and future backends.
 */
/**
 * Type guard to check if an object implements VectorStoreContract
 */
export function isVectorStore(obj) {
    if (!obj || typeof obj !== 'object')
        return false;
    const store = obj;
    return (typeof store.initialize === 'function' &&
        typeof store.addDocument === 'function' &&
        typeof store.search === 'function' &&
        'isInitialized' in store);
}
export default {
    isVectorStore,
};
//# sourceMappingURL=vector-store-interface.js.map