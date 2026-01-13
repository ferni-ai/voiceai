/**
 * Wellbeing Persistence Layer
 *
 * Persists wellbeing snapshots and profiles to Firestore for cross-session
 * data retention. In-memory caching provides fast reads.
 *
 * Storage structure:
 * - bogle_users/{userId}/wellbeing_profile (single document)
 * - bogle_users/{userId}/wellbeing_snapshots/{snapshotId} (collection)
 *
 * @module WellbeingPersistence
 */
import type { WellbeingSnapshot, WellbeingProfile } from './index.js';
declare function clearCacheForUser(userId: string): void;
/**
 * Save a wellbeing snapshot to Firestore.
 */
export declare function persistSnapshot(userId: string, snapshot: WellbeingSnapshot): Promise<boolean>;
/**
 * Load recent snapshots from Firestore.
 */
export declare function loadSnapshots(userId: string, days?: number): Promise<WellbeingSnapshot[]>;
/**
 * Save a wellbeing profile to Firestore.
 */
export declare function persistProfile(userId: string, profile: WellbeingProfile): Promise<boolean>;
/**
 * Load a wellbeing profile from Firestore.
 */
export declare function loadProfile(userId: string): Promise<WellbeingProfile | null>;
/**
 * Export all wellbeing data for a user (GDPR compliance).
 */
export declare function exportWellbeingData(userId: string): Promise<{
    profile: WellbeingProfile | null;
    snapshots: WellbeingSnapshot[];
} | null>;
/**
 * Delete all wellbeing data for a user (GDPR compliance).
 */
export declare function deleteWellbeingData(userId: string): Promise<boolean>;
export declare const wellbeingPersistence: {
    persistSnapshot: typeof persistSnapshot;
    loadSnapshots: typeof loadSnapshots;
    persistProfile: typeof persistProfile;
    loadProfile: typeof loadProfile;
    exportWellbeingData: typeof exportWellbeingData;
    deleteWellbeingData: typeof deleteWellbeingData;
    clearCache: typeof clearCacheForUser;
};
export default wellbeingPersistence;
//# sourceMappingURL=persistence.d.ts.map