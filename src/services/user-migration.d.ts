/**
 * User Migration Service
 *
 * Handles migration of user data from device-based IDs to Firebase UIDs.
 *
 * Migration Flow:
 * 1. User has existing data under device:{uuid}
 * 2. User authenticates with Firebase (gets Firebase UID)
 * 3. Frontend requests migration with both IDs
 * 4. This service transfers all data from device ID to Firebase UID
 * 5. Old device ID profile is marked as migrated (not deleted, for safety)
 *
 * @module UserMigration
 */
export interface MigrationRequest {
    /** The legacy device-based ID (e.g., "device:{uuid}") */
    deviceId: string;
    /** The new Firebase UID to migrate data to */
    firebaseUid: string;
    /** Optional: user's display name */
    displayName?: string;
    /** Optional: user's email */
    email?: string;
}
export interface MigrationResult {
    success: boolean;
    /** Number of conversations migrated */
    conversationsMigrated: number;
    /** Number of memories migrated */
    memoriesMigrated: number;
    /** Whether a new profile was created or existing was updated */
    profileAction: 'created' | 'merged' | 'none';
    /** Error message if migration failed */
    error?: string;
}
/**
 * Check if a device has already been migrated.
 */
export declare function isAlreadyMigrated(deviceId: string): boolean;
/**
 * Get the Firebase UID a device was migrated to.
 */
export declare function getMigratedUid(deviceId: string): string | null;
/**
 * Migrate user data from device ID to Firebase UID.
 *
 * This function:
 * 1. Loads the device-based profile
 * 2. Creates or updates the Firebase UID profile
 * 3. Copies conversations and memories
 * 4. Marks the device profile as migrated
 *
 * @param request - Migration parameters
 * @returns Migration result
 */
export declare function migrateUserData(request: MigrationRequest): Promise<MigrationResult>;
/**
 * Validate a migration request.
 */
export declare function validateMigrationRequest(request: Partial<MigrationRequest>): {
    valid: boolean;
    error?: string;
};
export declare const userMigration: {
    migrate: typeof migrateUserData;
    validate: typeof validateMigrationRequest;
    isAlreadyMigrated: typeof isAlreadyMigrated;
    getMigratedUid: typeof getMigratedUid;
};
//# sourceMappingURL=user-migration.d.ts.map