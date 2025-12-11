// @ts-nocheck - WIP file, types need updating
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

import { getDefaultStore } from '../memory/index.js';
import type { UserProfile } from '../types/user-profile.js';
import { createLogger } from '../utils/safe-logger.js';

const log = createLogger({ module: 'UserMigration' });

// ============================================================================
// TYPES
// ============================================================================

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

// ============================================================================
// MIGRATION TRACKING
// ============================================================================

/** Track completed migrations to prevent duplicates */
const completedMigrations = new Map<string, { timestamp: number; firebaseUid: string }>();

/**
 * Check if a device has already been migrated.
 */
export function isAlreadyMigrated(deviceId: string): boolean {
  const migration = completedMigrations.get(deviceId);
  if (!migration) return false;

  // Consider migration valid for 30 days
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
  return Date.now() - migration.timestamp < thirtyDaysMs;
}

/**
 * Get the Firebase UID a device was migrated to.
 */
export function getMigratedUid(deviceId: string): string | null {
  return completedMigrations.get(deviceId)?.firebaseUid ?? null;
}

// ============================================================================
// MIGRATION LOGIC
// ============================================================================

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
export async function migrateUserData(request: MigrationRequest): Promise<MigrationResult> {
  const { deviceId, firebaseUid, displayName, email } = request;
  const legacyUserId = deviceId.startsWith('device:') ? deviceId : `device:${deviceId}`;

  log.info('Starting user migration', {
    from: legacyUserId.substring(0, 20) + '...',
    to: firebaseUid.substring(0, 8) + '...',
  });

  // Check if already migrated
  if (isAlreadyMigrated(legacyUserId)) {
    const existingUid = getMigratedUid(legacyUserId);
    if (existingUid === firebaseUid) {
      log.info('Migration already completed for this device');
      return {
        success: true,
        conversationsMigrated: 0,
        memoriesMigrated: 0,
        profileAction: 'none',
      };
    }
    // Different Firebase UID - this is an error
    log.warn('Device already migrated to different Firebase UID', {
      existingUid: existingUid?.substring(0, 8) + '...',
    });
    return {
      success: false,
      conversationsMigrated: 0,
      memoriesMigrated: 0,
      profileAction: 'none',
      error: 'Device already migrated to a different account',
    };
  }

  try {
    const store = getDefaultStore();

    // 1. Load source profile
    const sourceProfile = await store.getProfile(legacyUserId);
    if (!sourceProfile) {
      log.info('No existing profile to migrate - creating fresh profile');
      // Create a new profile with the Firebase UID
      const newProfile: UserProfile = {
        userId: firebaseUid,
        name: displayName || 'Friend',
        email: email || undefined,
        createdAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
        totalConversations: 0,
        preferences: {},
        linkedIdentifiers: [],
        voiceProfile: undefined,
      };
      await store.saveProfile(newProfile);

      completedMigrations.set(legacyUserId, {
        timestamp: Date.now(),
        firebaseUid,
      });

      return {
        success: true,
        conversationsMigrated: 0,
        memoriesMigrated: 0,
        profileAction: 'created',
      };
    }

    // 2. Check for existing Firebase profile
    const existingFirebaseProfile = await store.getProfile(firebaseUid);
    let profileAction: 'created' | 'merged' = 'created';

    // 3. Create or merge profile
    if (existingFirebaseProfile) {
      // Merge profiles - combine data
      profileAction = 'merged';
      const mergedProfile: UserProfile = {
        ...existingFirebaseProfile,
        // Prefer newer name if available
        name: displayName || existingFirebaseProfile.name || sourceProfile.name,
        email: email || existingFirebaseProfile.email || sourceProfile.email,
        // Combine conversations count
        totalConversations:
          existingFirebaseProfile.totalConversations + sourceProfile.totalConversations,
        // Merge preferences (source overwrites existing)
        preferences: {
          ...existingFirebaseProfile.preferences,
          ...sourceProfile.preferences,
        },
        // Keep voice profile from source if exists
        voiceProfile: sourceProfile.voiceProfile || existingFirebaseProfile.voiceProfile,
        // Add legacy ID to linked identifiers
        linkedIdentifiers: [
          ...new Set([
            ...(existingFirebaseProfile.linkedIdentifiers || []),
            ...(sourceProfile.linkedIdentifiers || []),
            legacyUserId,
          ]),
        ],
        lastActiveAt: new Date().toISOString(),
      };
      await store.saveProfile(mergedProfile);
      log.info('Merged profiles');
    } else {
      // Create new profile with Firebase UID
      const migratedProfile: UserProfile = {
        ...sourceProfile,
        userId: firebaseUid,
        name: displayName || sourceProfile.name,
        email: email || sourceProfile.email,
        linkedIdentifiers: [...(sourceProfile.linkedIdentifiers || []), legacyUserId],
        lastActiveAt: new Date().toISOString(),
      };
      await store.saveProfile(migratedProfile);
      log.info('Created migrated profile');
    }

    // 4. Migrate conversations
    let conversationsMigrated = 0;
    try {
      const conversations = await store.getConversationHistory(legacyUserId, 1000);
      for (const conv of conversations) {
        // Save conversation under new user ID
        await store.saveConversation(firebaseUid, {
          ...conv,
          userId: firebaseUid,
        });
        conversationsMigrated++;
      }
      log.info('Migrated conversations', { count: conversationsMigrated });
    } catch (convErr) {
      log.warn('Failed to migrate some conversations', { error: String(convErr) });
    }

    // 5. Migrate memories
    let memoriesMigrated = 0;
    try {
      const memories = await store.getMemories(legacyUserId, 1000);
      for (const memory of memories) {
        await store.saveMemory(firebaseUid, {
          ...memory,
          userId: firebaseUid,
        });
        memoriesMigrated++;
      }
      log.info('Migrated memories', { count: memoriesMigrated });
    } catch (memErr) {
      log.warn('Failed to migrate some memories', { error: String(memErr) });
    }

    // 6. Mark source profile as migrated (don't delete for safety)
    const updatedSourceProfile: UserProfile = {
      ...sourceProfile,
      linkedIdentifiers: [...(sourceProfile.linkedIdentifiers || []), `migrated:${firebaseUid}`],
      preferences: {
        ...sourceProfile.preferences,
        migratedTo: firebaseUid,
        migratedAt: new Date().toISOString(),
      },
    };
    await store.saveProfile(updatedSourceProfile);

    // 7. Track completed migration
    completedMigrations.set(legacyUserId, {
      timestamp: Date.now(),
      firebaseUid,
    });

    log.info('Migration completed successfully', {
      conversationsMigrated,
      memoriesMigrated,
      profileAction,
    });

    return {
      success: true,
      conversationsMigrated,
      memoriesMigrated,
      profileAction,
    };
  } catch (error) {
    log.error('Migration failed', { error: String(error) });
    return {
      success: false,
      conversationsMigrated: 0,
      memoriesMigrated: 0,
      profileAction: 'none',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Validate a migration request.
 */
export function validateMigrationRequest(request: Partial<MigrationRequest>): {
  valid: boolean;
  error?: string;
} {
  if (!request.deviceId) {
    return { valid: false, error: 'Missing deviceId' };
  }
  if (!request.firebaseUid) {
    return { valid: false, error: 'Missing firebaseUid' };
  }
  if (request.firebaseUid.length < 20) {
    return { valid: false, error: 'Invalid firebaseUid format' };
  }
  return { valid: true };
}

// ============================================================================
// EXPORTS
// ============================================================================

export const userMigration = {
  migrate: migrateUserData,
  validate: validateMigrationRequest,
  isAlreadyMigrated,
  getMigratedUid,
};
