/**
 * Identity Linking Service
 *
 * Merges data from anonymous/device sessions when a user authenticates.
 * This prevents data fragmentation across multiple identities.
 *
 * When a user authenticates with Firebase UID, we:
 * 1. Look for any device-based or anonymous sessions from the same device
 * 2. Migrate their data to the authenticated profile
 * 3. Mark the old profile as migrated
 *
 * @module services/identity/identity-linking
 */

import { getFirestoreDb } from '../../utils/firestore-utils.js';
import { createLogger } from '../../utils/safe-logger.js';

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

// Collections to migrate (subcollections under bogle_users/{userId})
const MIGRATABLE_COLLECTIONS = [
  'memories',
  'promoted_entities',
  'emotional_arcs',
  'topic_patterns',
  'conversations',
  'voice_sessions',
  'deep_understanding',
  'ferni_commitments',
  'memory_highlights',
  'shared_moments',
  'humanization',
  'persona_affinities',
];

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
    { sourceUserId: sourceUserId.substring(0, 20), targetFirebaseUid: targetFirebaseUid.substring(0, 8) },
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

    // Check if source exists
    const sourceDoc = await sourceRef.get();
    if (!sourceDoc.exists) {
      log.debug({ sourceUserId }, 'Source profile does not exist, nothing to migrate');
      result.success = true;
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

    // Migrate each collection
    for (const collectionName of MIGRATABLE_COLLECTIONS) {
      try {
        const migrated = await migrateCollection(sourceRef, targetRef, collectionName);
        if (migrated > 0) {
          result.migratedCollections.push(`${collectionName}:${migrated}`);
          log.info(
            { collection: collectionName, count: migrated },
            '📦 Migrated collection'
          );
        }
      } catch (error) {
        const errorMsg = `Failed to migrate ${collectionName}: ${String(error)}`;
        result.errors.push(errorMsg);
        log.warn({ error: String(error), collection: collectionName }, 'Migration failed for collection');
      }
    }

    // Mark source as migrated
    await sourceRef.update({
      migratedTo: targetFirebaseUid,
      migratedAt: new Date().toISOString(),
      _migrated: true,
    });

    result.success = result.errors.length === 0;
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
 * Migrate documents from source collection to target collection.
 * Returns the number of documents migrated.
 */
async function migrateCollection(
  sourceRef: FirebaseFirestore.DocumentReference,
  targetRef: FirebaseFirestore.DocumentReference,
  collectionName: string
): Promise<number> {
  const db = getFirestoreDb();
  if (!db) return 0;

  const sourceCollection = sourceRef.collection(collectionName);
  const targetCollection = targetRef.collection(collectionName);

  // Get all source documents
  const snapshot = await sourceCollection.get();
  if (snapshot.empty) return 0;

  // Migrate in batches of 500 (Firestore limit)
  const BATCH_SIZE = 500;
  let migrated = 0;
  let batch = db.batch();
  let batchCount = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data();

    // Add migration metadata
    const migratedData = {
      ...data,
      _migratedFrom: sourceRef.id,
      _migratedAt: new Date().toISOString(),
    };

    // Use same document ID to preserve references
    const targetDocRef = targetCollection.doc(doc.id);
    batch.set(targetDocRef, migratedData, { merge: true });

    batchCount++;
    migrated++;

    // Commit batch when full
    if (batchCount >= BATCH_SIZE) {
      await batch.commit();
      batch = db.batch();
      batchCount = 0;
    }
  }

  // Commit remaining documents
  if (batchCount > 0) {
    await batch.commit();
  }

  return migrated;
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
    if (deviceData?._migrated) {
      log.debug({ deviceId }, 'Device profile already migrated');
      return;
    }

    // Check if device has meaningful data worth migrating
    const hasConversations = deviceData?.totalConversations > 0;
    const hasMemories = await hasSubcollectionData(deviceDoc.ref, 'memories');
    const hasEntities = await hasSubcollectionData(deviceDoc.ref, 'promoted_entities');

    if (!hasConversations && !hasMemories && !hasEntities) {
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

/**
 * Check if a subcollection has any documents.
 */
async function hasSubcollectionData(
  docRef: FirebaseFirestore.DocumentReference,
  collectionName: string
): Promise<boolean> {
  const snapshot = await docRef.collection(collectionName).limit(1).get();
  return !snapshot.empty;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  linkIdentity,
  autoLinkOnAuth,
};
