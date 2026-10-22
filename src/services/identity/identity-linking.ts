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
 *    autoLinkOnAuth and user-migration.ts both read. A failed copy still claims
 *    it, with _migrationIncomplete: true, and is retried while that is set.
 *    A retry never overwrites a target doc changed since (newer updatedAt).
 *
 * @module services/identity/identity-linking
 */

import { getFirestoreDb } from '../../utils/firestore-utils.js';
import { createLogger } from '../../utils/safe-logger.js';
import type { VerifiedToken } from './firebase-auth.js';
import { markMigrated, migratedToOf, migrationIncomplete } from './migration-flag.js';

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
  return linkSource(sourceUserId, targetFirebaseUid, false);
}

/**
 * Link a Firebase anonymous account (bogle_users/<anonUid>, no prefix) into the
 * account the user just signed in to, as linkIdentity does for device: ids.
 *
 * A raw uid is accepted here only because the caller verified the anonymous
 * account's own ID token: pass that verified token, never a uid from a request
 * body. Any other sign-in provider is refused. A source with no data is still
 * claimed, so a replay reads as already merged.
 */
export async function linkVerifiedAnonymousIdentity(
  anonToken: Pick<VerifiedToken, 'uid' | 'signInProvider'>,
  targetFirebaseUid: string
): Promise<LinkingResult> {
  if (anonToken.signInProvider !== 'anonymous') {
    return {
      ...emptyResult(anonToken.uid, targetFirebaseUid),
      errors: ['Source is not anonymous'],
    };
  }
  const result = await linkSource(anonToken.uid, targetFirebaseUid, true);
  const db = getFirestoreDb();
  if (result.success && result.migratedCollections.length === 0 && db) {
    await markMigrated(db, anonToken.uid, targetFirebaseUid, true);
  }
  return result;
}

const emptyResult = (sourceId: string, targetId: string): LinkingResult => ({
  success: false,
  sourceId,
  targetId,
  migratedCollections: [],
  errors: [],
});

/** A prefixed id keeps its prefix in logs; a raw uid shows 8 characters. */
const shortId = (id: string): string => id.substring(0, id.includes(':') ? 20 : 8);

async function linkSource(
  sourceUserId: string,
  targetFirebaseUid: string,
  verifiedAnonymous: boolean
): Promise<LinkingResult> {
  const result = emptyResult(sourceUserId, targetFirebaseUid);

  log.info(
    { sourceUserId: shortId(sourceUserId), targetFirebaseUid: targetFirebaseUid.substring(0, 8) },
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

  // Don't link if source doesn't look like a device/anonymous ID, unless its token was verified
  const prefixed = sourceUserId.startsWith('device:') || sourceUserId.startsWith('anon:');
  if (!prefixed && !verifiedAnonymous) {
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
      log.debug({ sourceUserId: shortId(sourceUserId) }, 'Source has no data, nothing to migrate');
      result.success = true;
      return result;
    }

    const migratedTo = migratedToOf(sourceDoc.data());
    if (migratedTo === targetFirebaseUid && !migrationIncomplete(sourceDoc.data())) {
      result.success = true;
      return result;
    }
    if (migratedTo && migratedTo !== targetFirebaseUid) {
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

    // Claim the source either way; a partial copy stays marked for a retry
    result.success = result.errors.length === 0;
    await markMigrated(db, sourceUserId, targetFirebaseUid, result.success);
    log.info(
      {
        sourceUserId: shortId(sourceUserId),
        targetFirebaseUid: targetFirebaseUid.substring(0, 8),
        collections: result.migratedCollections,
        errors: result.errors,
      },
      '🔗 Identity linking complete'
    );

    return result;
  } catch (error) {
    result.errors.push(`Linking failed: ${String(error)}`);
    const ids = {
      sourceUserId: shortId(sourceUserId),
      targetFirebaseUid: shortId(targetFirebaseUid),
    };
    log.error({ error: String(error), ...ids }, 'Identity linking failed');
    return result;
  }
}

/** An updatedAt as epoch ms: a Timestamp, Date, ISO string or number; NaN otherwise. */
function millisOf(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Date.parse(value);
  if (value instanceof Date) return value.getTime();
  const toMillis = (value as { toMillis?: () => number } | null)?.toMillis;
  return typeof toMillis === 'function' ? toMillis.call(value) : NaN;
}

/** True only when both times are known and the target's is later. */
function isNewer(target: unknown, source: unknown): boolean {
  const t = millisOf(target);
  const s = millisOf(source);
  return Number.isFinite(t) && Number.isFinite(s) && t > s;
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
  // On a retry the user may have changed a target doc since; stale data must not win
  const current = new Map((await target.get()).docs.map((d) => [d.id, d.data()]));
  const BATCH_SIZE = 500; // Firestore limit
  let copied = 0;
  let batch = db.batch();
  let batchCount = 0;
  for (const doc of snapshot.docs) {
    if (isNewer(current.get(doc.id)?.updatedAt, doc.data().updatedAt)) continue;
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
    if (migratedToOf(deviceData) && !migrationIncomplete(deviceData)) {
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
  linkVerifiedAnonymousIdentity,
  autoLinkOnAuth,
};
