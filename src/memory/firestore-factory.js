/**
 * Firestore Factory
 *
 * Re-exports Firestore access from the centralized superhuman utils.
 * This provides a consistent interface for services that need Firestore.
 *
 * @module memory/firestore-factory
 */
import { getFirestoreDb } from '../utils/firestore-utils.js';
/**
 * Get the Firestore database instance.
 * Returns null if Firestore is not configured/available.
 */
export function getFirestore() {
    return getFirestoreDb();
}
export default { getFirestore };
//# sourceMappingURL=firestore-factory.js.map