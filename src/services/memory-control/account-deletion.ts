/**
 * Account erasure (GDPR right to erasure).
 *
 * Firestore does not cascade deletes: removing `bogle_users/{uid}` leaves every
 * subcollection (conversations, turns, facts, ...) in place. This deletes the
 * user's documents recursively, the user's vector-store entries, graph records
 * and user-keyed Cloud Storage objects, then verifies nothing is left so the
 * API can report the truth.
 *
 * @module services/memory-control/account-deletion
 */

import type { DocumentReference, Firestore } from '@google-cloud/firestore';
import { createLogger } from '../../utils/safe-logger.js';
import { getDb, USERS } from './db.js';
import { removeAllVectors, removeGraphRecords } from './derived-stores.js';
import { deleteAllDomains, type DomainOutcome } from './domains.js';
import { assertSafeUserId } from './erase.js';

const log = createLogger({ module: 'AccountDeletion' });

/** Top-level user documents (each with subcollections) keyed by user ID. */
const USER_ROOTS = [USERS, 'users'] as const;

export interface StorageTarget {
  bucket: string;
  prefix: string;
}

export interface AccountDeletionReport {
  /** True when no user document or subcollection remains in Firestore. */
  complete: boolean;
  /** Whether anything existed for this user before deletion. */
  existed: boolean;
  firestore: Record<string, 'deleted' | 'absent' | 'failed'>;
  embeddings: number;
  graphRecords: number;
  storage: Record<string, number | 'failed'>;
  /** Registered memory domains (important dates, ...): items removed or 'failed'. */
  domains: Record<string, DomainOutcome>;
  errors: string[];
}

/** User-keyed Cloud Storage prefixes written by the app (see services writing `<prefix>/${userId}/`). */
export function storageTargets(userId: string): StorageTarget[] {
  const targets: StorageTarget[] = [];
  const add = (bucket: string | undefined, prefix: string): void => {
    if (bucket) targets.push({ bucket, prefix: `${prefix}/${userId}/` });
  };
  const general = process.env.GCS_BUCKET_NAME;
  const voice = process.env.VOICE_MESSAGE_BUCKET || 'ferni-voice-messages';
  add(general, 'outreach-voice');
  add(general, 'voice-messages');
  if (voice !== general) add(voice, 'voice-messages');
  add(process.env.FIREBASE_STORAGE_BUCKET, 'visual-memories');
  return targets;
}

async function deleteStorage(userId: string, report: AccountDeletionReport): Promise<void> {
  const targets = storageTargets(userId);
  if (targets.length === 0) return;
  let storage: { bucket: (name: string) => StorageBucket };
  try {
    const { Storage } = await import('@google-cloud/storage');
    storage = new Storage() as unknown as { bucket: (name: string) => StorageBucket };
  } catch (error) {
    report.errors.push(`storage client: ${String(error)}`);
    for (const t of targets) report.storage[`${t.bucket}/${t.prefix}`] = 'failed';
    return;
  }
  for (const t of targets) {
    const key = `${t.bucket}/${t.prefix}`;
    try {
      const bucket = storage.bucket(t.bucket);
      const [files] = await bucket.getFiles({ prefix: t.prefix });
      if (files.length > 0) await bucket.deleteFiles({ prefix: t.prefix, force: true });
      report.storage[key] = files.length;
    } catch (error) {
      const code = (error as { code?: number }).code;
      // A bucket that doesn't exist holds nothing of this user's.
      if (code === 404) {
        report.storage[key] = 0;
        continue;
      }
      report.storage[key] = 'failed';
      report.errors.push(`storage ${key}: ${String(error)}`);
    }
  }
}

interface StorageBucket {
  getFiles: (q: { prefix: string }) => Promise<[unknown[]]>;
  deleteFiles: (q: { prefix: string; force: boolean }) => Promise<void>;
}

async function hasData(ref: DocumentReference): Promise<boolean> {
  const snap = await ref.get();
  if (snap.exists) return true;
  const subcollections = await ref.listCollections();
  return subcollections.length > 0;
}

async function deleteRoot(db: Firestore, ref: DocumentReference): Promise<void> {
  if (typeof db.recursiveDelete === 'function') {
    await db.recursiveDelete(ref);
    return;
  }
  // Fallback for SDKs without recursiveDelete: depth-first by listing.
  for (const col of await ref.listCollections()) {
    for (const doc of (await col.get()).docs) await deleteRoot(db, doc.ref);
  }
  await ref.delete();
}

/** IDs in `bogle_users/{uid}/linked_identities` (written by identity merge). */
async function linkedIdentities(
  db: Firestore,
  userId: string,
  report: AccountDeletionReport
): Promise<string[]> {
  try {
    const snap = await db.collection(USERS).doc(userId).collection('linked_identities').get();
    return snap.docs.map((d) => d.id).filter((id) => id !== userId && id !== '');
  } catch (error) {
    report.errors.push(`linked identities: ${String(error)}`);
    return [];
  }
}

/** Recursively delete everything this app stores for one user. Never throws for partial failures. */
export async function deleteUserAccountData(userId: string): Promise<AccountDeletionReport> {
  assertSafeUserId(userId);
  const report: AccountDeletionReport = {
    complete: false,
    existed: false,
    firestore: {},
    embeddings: 0,
    graphRecords: 0,
    storage: {},
    domains: {},
    errors: [],
  };

  const db = getDb();
  if (!db) {
    report.errors.push('Firestore unavailable');
    return report;
  }

  // Domains first: some keep data outside bogle_users/{uid} or need their own cleanup.
  report.domains = await deleteAllDomains(userId, report.errors);

  // Anonymous identities merged into this account (identity merge) keep a
  // redirect doc, and may hold data if a merge never finished. Read the links
  // before the account root (which holds them) is deleted.
  const linked = await linkedIdentities(db, userId, report);

  let remaining = false;
  for (const anonId of linked) {
    const ref = db.collection(USERS).doc(anonId);
    const key = `linked:${anonId}`;
    try {
      const snap = await ref.get();
      const mergedInto = snap.data()?.mergedInto;
      // Only ever delete an identity that points at this account.
      if (snap.exists && mergedInto !== userId) {
        report.firestore[key] = 'absent';
        continue;
      }
      await deleteRoot(db, ref);
      if (await hasData(ref)) throw new Error('documents remain after delete');
      report.firestore[key] = 'deleted';
      report.embeddings += await removeAllVectors(anonId, report.errors);
    } catch (error) {
      remaining = true;
      report.firestore[key] = 'failed';
      report.errors.push(`firestore ${key}: ${String(error)}`);
    }
  }

  for (const root of USER_ROOTS) {
    const ref = db.collection(root).doc(userId);
    try {
      if (!(await hasData(ref))) {
        report.firestore[root] = 'absent';
        continue;
      }
      report.existed = true;
      await deleteRoot(db, ref);
      if (await hasData(ref)) throw new Error('documents remain after delete');
      report.firestore[root] = 'deleted';
    } catch (error) {
      remaining = true;
      report.firestore[root] = 'failed';
      report.errors.push(`firestore ${root}: ${String(error)}`);
    }
  }

  report.embeddings += await removeAllVectors(userId, report.errors);
  report.graphRecords = await removeGraphRecords(userId, { all: true }, report.errors);
  await deleteStorage(userId, report);
  if (report.embeddings > 0 || Object.values(report.storage).some((n) => n !== 0)) {
    report.existed = true;
  }

  report.complete = !remaining && report.errors.length === 0;
  log.warn(
    { complete: report.complete, firestore: report.firestore, errors: report.errors.length },
    'Account data deletion finished'
  );
  return report;
}
