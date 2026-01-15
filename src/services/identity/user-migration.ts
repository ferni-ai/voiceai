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

import { getFirestoreStore } from '../memory/firestore-store.js';
import { createUserProfile, type UserProfile } from '../../types/user-profile.js';
import { createLogger } from '../../utils/safe-logger.js';
import type { MemoryStore } from '../../memory/store.js';
import { cleanForFirestore } from '../../utils/firestore-utils.js';

// Cache the store reference to avoid repeated async calls
let cachedStore: MemoryStore | null = null;

/**
 * Get the store instance - uses Firestore directly for production migrations.
 * This ensures migrations always persist to Firestore regardless of environment.
 */
function getStore(): MemoryStore {
  if (!cachedStore) {
    // Always use Firestore for migrations - this is where user profiles live
    cachedStore = getFirestoreStore();
  }
  return cachedStore;
}

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
    from: `${legacyUserId.substring(0, 20)}...`,
    to: `${firebaseUid.substring(0, 8)}...`,
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
      existingUid: `${existingUid?.substring(0, 8)}...`,
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
    const store = getStore();

    // 1. Load source profile
    const sourceProfile = await store.getProfile(legacyUserId);
    if (!sourceProfile) {
      log.info('No existing profile to migrate - creating fresh profile');
      // Create a new profile with the Firebase UID using the proper factory
      const newProfile = createUserProfile(firebaseUid, displayName || 'Friend');
      if (email) {
        newProfile.contactInfo = { ...newProfile.contactInfo, email };
      }
      await store.saveProfile(newProfile);

      completedMigrations.set(cleanForFirestore(legacyUserId), {
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
        // Merge contact info
        contactInfo: {
          ...existingFirebaseProfile.contactInfo,
          ...sourceProfile.contactInfo,
          ...(email ? { email } : {}),
        },
        // Combine conversations count
        totalConversations:
          existingFirebaseProfile.totalConversations + sourceProfile.totalConversations,
        // Merge preferences (source overwrites existing)
        preferences: {
          ...existingFirebaseProfile.preferences,
          ...sourceProfile.preferences,
        },
        // Keep voice sketch from source if exists
        voiceSketch: sourceProfile.voiceSketch || existingFirebaseProfile.voiceSketch,
        // Add legacy ID to linked identifiers
        linkedIdentifiers: [
          ...new Set([
            ...(existingFirebaseProfile.linkedIdentifiers || []),
            ...(sourceProfile.linkedIdentifiers || []),
            legacyUserId,
          ]),
        ],
        lastContact: new Date(),
      };
      await store.saveProfile(mergedProfile);
      log.info('Merged profiles');
    } else {
      // Create new profile with Firebase UID
      const migratedProfile: UserProfile = {
        ...sourceProfile,
        id: firebaseUid,
        name: displayName || sourceProfile.name,
        contactInfo: {
          ...sourceProfile.contactInfo,
          ...(email ? { email } : {}),
        },
        linkedIdentifiers: [...(sourceProfile.linkedIdentifiers || []), legacyUserId],
        lastContact: new Date(),
      };
      await store.saveProfile(migratedProfile);
      log.info('Created migrated profile');
    }

    // 4. Migrate conversation summaries
    let conversationsMigrated = 0;
    try {
      const summaries = await store.getSummaries(legacyUserId, { limit: 1000 });
      for (const summary of summaries) {
        // Save summary under new user ID
        await store.saveSummary(firebaseUid, {
          ...summary,
        });
        conversationsMigrated++;
      }
      log.info('Migrated conversation summaries', { count: conversationsMigrated });
    } catch (convErr) {
      log.warn('Failed to migrate some conversation summaries', { error: String(convErr) });
    }

    // 5. Migrate key moments (memories)
    let memoriesMigrated = 0;
    try {
      const moments = await store.getKeyMoments(legacyUserId, { limit: 1000 });
      for (const moment of moments) {
        await store.addKeyMoment(firebaseUid, {
          ...moment,
        });
        memoriesMigrated++;
      }
      log.info('Migrated key moments', { count: memoriesMigrated });
    } catch (memErr) {
      log.warn('Failed to migrate some key moments', { error: String(memErr) });
    }

    // 6. Mark source profile as migrated (don't delete for safety)
    // Store migration info in linkedIdentifiers and customData
    const updatedSourceProfile: UserProfile = {
      ...sourceProfile,
      linkedIdentifiers: [...(sourceProfile.linkedIdentifiers || []), `migrated:${firebaseUid}`],
      customData: {
        ...sourceProfile.customData,
        migratedTo: firebaseUid,
        migratedAt: new Date().toISOString(),
      },
    };
    await store.saveProfile(updatedSourceProfile);

    // 7. Track completed migration
    completedMigrations.set(cleanForFirestore(legacyUserId), {
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
