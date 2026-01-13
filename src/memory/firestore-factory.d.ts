/**
 * Firestore Factory
 *
 * Re-exports Firestore access from the centralized superhuman utils.
 * This provides a consistent interface for services that need Firestore.
 *
 * @module memory/firestore-factory
 */
/**
 * Get the Firestore database instance.
 * Returns null if Firestore is not configured/available.
 */
export declare function getFirestore(): FirebaseFirestore.Firestore | null;
declare const _default: {
    getFirestore: typeof getFirestore;
};
export default _default;
//# sourceMappingURL=firestore-factory.d.ts.map