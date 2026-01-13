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
export type LifeAutomationDomain = 'subscriptions' | 'documents' | 'meals' | 'workflows';
export interface FirestoreOperationResult<T> {
    success: boolean;
    data?: T;
    error?: string;
}
/**
 * Get data for a specific life automation domain
 * Returns null if Firestore is unavailable or data doesn't exist
 */
export declare function getLifeAutomationData<T>(userId: string, domain: LifeAutomationDomain): Promise<T | null>;
/**
 * Save data for a specific life automation domain
 * Uses merge to avoid overwriting unrelated fields
 */
export declare function saveLifeAutomationData<T extends object>(userId: string, domain: LifeAutomationDomain, data: T): Promise<FirestoreOperationResult<void>>;
/**
 * Delete data for a specific life automation domain
 */
export declare function deleteLifeAutomationData(userId: string, domain: LifeAutomationDomain): Promise<FirestoreOperationResult<void>>;
/**
 * Check if Firestore is available
 * Use this to decide whether to use Firestore or fallback to in-memory
 */
export declare function isFirestoreAvailable(): boolean;
/**
 * Batch save multiple domains at once (for migrations or bulk updates)
 */
export declare function batchSaveLifeAutomationData(userId: string, domains: Array<{
    domain: LifeAutomationDomain;
    data: object;
}>): Promise<FirestoreOperationResult<void>>;
/**
 * Get all life automation data for a user (for exports or migrations)
 */
export declare function getAllLifeAutomationData(userId: string): Promise<Record<LifeAutomationDomain, unknown>>;
/**
 * Migrate data from in-memory storage to Firestore
 * Used during the transition from Map-based to Firestore-based storage
 */
export declare function migrateToFirestore<T extends object>(userId: string, domain: LifeAutomationDomain, inMemoryData: T): Promise<FirestoreOperationResult<void>>;
/**
 * Check if user has any life automation data in Firestore
 */
export declare function hasLifeAutomationData(userId: string): Promise<boolean>;
//# sourceMappingURL=firestore-life-adapter.d.ts.map