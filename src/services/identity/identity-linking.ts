/**
 * Identity Linking Service
 *
 * Merges data from anonymous/device sessions when a user authenticates.
 * This prevents data fragmentation across multiple identities.
 *
 * When a user authenticates with Firebase UID, we:
 * 1. Look for any device-based or anonymous sessions from the same device
 * 2. Copy every subcollection of its record (listCollections, at any depth) to the
 *    authenticated profile. A fixed list of 12 names used to leave ~28 behind.
 * 3. Mark the old record with _migratedTo (migration-flag.ts), the one flag
 *    autoLinkOnAuth and user-migration.ts both read; only after a full copy, so a
 *    failed one is retried
 *
 * @module services/identity/identity-linking
 */

import { getFirestoreDb } from '../../utils/firestore-utils.js';
import { createLogger } from '../../utils/safe-logger.js';
import { markMigrated, migratedToOf } from './migration-flag.js';

const log = createLogger({ module: 'identity-linking' });

// ============================================================================
// TYPES
// ============================================================================

export interface LinkingResult {
  success: boolean;
  sourceId: string;
  targetId: string;
  migratedCollections: string[];
  errors: string[];
}

// ============================================================================
// IDENTITY LINKING
// ============================================================================

/**
 * Link an anonymous/device identity to an authenticated Firebase UID.
 * Migrates all data from source to target profile.
 *
 * @param sourceUserId - The anonymous or device-based user ID (e.g., "device:xxx" or "anon:xxx")
 * @param targetFirebaseUid - The authenticated Firebase UID
 * @returns Result of the linking operation
 */
export async function linkIdentity(
  sourceUserId: string,
  targetFirebaseUid: string
): Promise<LinkingResult> {
  const result: LinkingResult = {
    success: false,
    sourceId: sourceUserId,
    targetId: targetFirebaseUid,
    migratedCollections: [],
    errors: [],
  };

  log.info(
    {
      sourceUserId: sourceUserId.substring(0, 20),
      targetFirebaseUid: targetFirebaseUid.substring(0, 8),
    },
    '🔗 Starting identity linking'
  );

  const db = getFirestoreDb();
  if (!db) {
    result.errors.push('Firestore not available');
    return result;
  }

  // Don't link if source and target are the same
  if (sourceUserId === targetFirebaseUid) {
    result.success = true;
    return result;
  }

  // Don't link if source doesn't look like a device/anonymous ID
  if (!sourceUserId.startsWith('device:') && !sourceUserId.startsWith('anon:')) {
    result.errors.push('Source is not a device or anonymous ID');
    return result;
  }

  try {
    const sourceRef = db.collection('bogle_users').doc(sourceUserId);
    const targetRef = db.collection('bogle_users').doc(targetFirebaseUid);

    // A record can be missing and still hold subcollections
    const sourceDoc = await sourceRef.get();
    const subcollections = await sourceRef.listCollections();
    if (!sourceDoc.exists && subcollections.length === 0) {
      log.debug({ sourceUserId }, 'Source profile does not exist, nothing to migrate');
      result.success = true;
      return result;
    }

    const migratedTo = migratedToOf(sourceDoc.data());
    if (migratedTo === targetFirebaseUid) {
      result.success = true;
      return result;
    }
    if (migratedTo) {
      result.errors.push('Source already migrated to a different account');
      return result;
    }

    // Ensure target exists
    const targetDoc = await targetRef.get();
    if (!targetDoc.exists) {
      // Create minimal target profile
      await targetRef.set({
        createdAt: new Date().toISOString(),
        migratedFrom: sourceUserId,
        migratedAt: new Date().toISOString(),
      });
    }

    // Migrate every collection the record has
    for (const { id: collectionName } of subcollections) {
      try {
        const migrated = await copyTree(
          sourceRef.collection(collectionName),
          targetRef.collection(collectionName),
          sourceUserId
        );
        if (migrated > 0) {
          result.migratedCollections.push(`${collectionName}:${migrated}`);
          log.info({ collection: collectionName, count: migrated }, '📦 Migrated collection');
        }
      } catch (error) {
        const errorMsg = `Failed to migrate ${collectionName}: ${String(error)}`;
        result.errors.push(errorMsg);
        log.warn(
          { error: String(error), collection: collectionName },
          'Migration failed for collection'
        );
      }
    }

    // Mark the source only after everything copied, so a partial copy is retried
    result.success = result.errors.length === 0;
    if (result.success) await markMigrated(db, sourceUserId, targetFirebaseUid);
    log.info(
      {
        sourceUserId: sourceUserId.substring(0, 20),
        targetFirebaseUid: targetFirebaseUid.substring(0, 8),
        collections: result.migratedCollections,
        errors: result.errors,
      },
      '🔗 Identity linking complete'
    );

    return result;
  } catch (error) {
    result.errors.push(`Linking failed: ${String(error)}`);
    log.error({ error: String(error), sourceUserId, targetFirebaseUid }, 'Identity linking failed');
    return result;
  }
}

/**
 * Copy every document of `source` to the same id under `target`, and every
 * subcollection under each of them, at any depth. Returns the documents copied.
 */
async function copyTree(
  source: FirebaseFirestore.CollectionReference,
  target: FirebaseFirestore.CollectionReference,
  sourceUserId: string
): Promise<number> {
  const db = getFirestoreDb();
  if (!db) return 0;

  const snapshot = await source.get();
  const BATCH_SIZE = 500; // Firestore limit
  let copied = 0;
  let batch = db.batch();
  let batchCount = 0;
  for (const doc of snapshot.docs) {
    // Same document id, so references keep working
    batch.set(
      target.doc(doc.id),
      { ...doc.data(), _migratedFrom: sourceUserId, _migratedAt: new Date().toISOString() },
      { merge: true }
    );
    copied++;
    if (++batchCount >= BATCH_SIZE) {
      await batch.commit();
      batch = db.batch();
      batchCount = 0;
    }
  }
  if (batchCount > 0) await batch.commit();

  // listDocuments also returns missing parents that only hold subcollections
  for (const ref of await source.listDocuments()) {
    for (const sub of await ref.listCollections()) {
      copied += await copyTree(sub, target.doc(ref.id).collection(sub.id), sourceUserId);
    }
  }
  return copied;
}

/**
 * Check if a device ID has previous session data that should be linked.
 * Call this when a user authenticates to automatically merge their data.
 *
 * @param deviceId - The device ID from the session
 * @param firebaseUid - The authenticated Firebase UID
 */
export async function autoLinkOnAuth(
  deviceId: string | undefined,
  firebaseUid: string
): Promise<void> {
  if (!deviceId) return;

  const deviceUserId = `device:${deviceId}`;

  try {
    const db = getFirestoreDb();
    if (!db) return;

    // Check if device profile exists and hasn't been migrated
    const deviceDoc = await db.collection('bogle_users').doc(deviceUserId).get();
    if (!deviceDoc.exists) return;

    const deviceData = deviceDoc.data();
    if (migratedToOf(deviceData)) {
      log.debug({ deviceId }, 'Device profile already migrated');
      return;
    }

    // Worth migrating when it has conversations or any subcollection at all
    const hasConversations = deviceData?.totalConversations > 0;
    const hasSubcollections = (await deviceDoc.ref.listCollections()).length > 0;

    if (!hasConversations && !hasSubcollections) {
      log.debug({ deviceId }, 'Device profile has no data to migrate');
      return;
    }

    log.info(
      { deviceId: deviceId.substring(0, 16), firebaseUid: firebaseUid.substring(0, 8) },
      '🔗 Auto-linking device profile on auth'
    );

    const result = await linkIdentity(deviceUserId, firebaseUid);
    if (!result.success) {
      log.warn({ errors: result.errors, deviceId }, 'Auto-link had errors');
    }
  } catch (error) {
    log.warn({ error: String(error), deviceId }, 'Auto-link failed (non-blocking)');
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  linkIdentity,
  autoLinkOnAuth,
};
