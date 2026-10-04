/**
 * One trust system's Firestore document: bogle_users/{userId}/trust_profiles/{system}.
 *
 * The voice agent writes these at session end (persistence.ts); the API server
 * is a separate process and reads them back for the Trust dashboard. Reads say
 * whether the doc was found, missing, or unreadable, so a failed read is never
 * mistaken for "this user has no data".
 *
 * @module services/trust-systems/trust-doc
 */

import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { removeUndefined } from '../../utils/firestore-utils.js';
import { createLogger } from '../../utils/safe-logger.js';
import { parseTrustProfile } from './parse-trust-profile.js';

const log = createLogger({ module: 'TrustDoc' });

export const TRUST_COLLECTION = 'trust_profiles';
export const TRUST_DOC_VERSION = 1;

interface FirestoreTrustDoc {
  data: string; // JSON stringified profile
  updatedAt: FirebaseFirestore.FieldValue;
  version: number;
}

export type TrustDocRead<T> =
  | { status: 'found'; data: T }
  | { status: 'missing' }
  | { status: 'error'; error: unknown };

let db: FirebaseFirestore.Firestore | null = null;

export function getTrustDb(): FirebaseFirestore.Firestore {
  if (!db) {
    try {
      db = getFirestore();
    } catch (error) {
      log.warn({ error }, 'Firestore not initialized, using memory-only mode');
      throw new Error('Firestore not available');
    }
  }
  return db;
}

function trustDocRef(userId: string, systemName: string): FirebaseFirestore.DocumentReference {
  return getTrustDb()
    .collection('bogle_users')
    .doc(userId)
    .collection(TRUST_COLLECTION)
    .doc(systemName);
}

/** Read one trust system's profile, with its dates as Dates. */
export async function readTrustDoc<T>(
  userId: string,
  systemName: string
): Promise<TrustDocRead<T>> {
  try {
    const doc = await trustDocRef(userId, systemName).get();
    if (!doc.exists) return { status: 'missing' };
    return { status: 'found', data: parseTrustProfile<T>((doc.data() as FirestoreTrustDoc).data) };
  } catch (error) {
    log.warn({ error, userId, systemName }, 'Failed to load trust profile');
    return { status: 'error', error };
  }
}

/** Write one trust system's profile. Returns false for a null profile or a failed write. */
export async function writeTrustDoc<T>(
  userId: string,
  systemName: string,
  profile: T | null
): Promise<boolean> {
  if (profile === null || profile === undefined) return false;
  try {
    const doc: FirestoreTrustDoc = {
      data: JSON.stringify(profile),
      updatedAt: FieldValue.serverTimestamp(),
      version: TRUST_DOC_VERSION,
    };
    await trustDocRef(userId, systemName).set(removeUndefined(doc), { merge: true });
    log.debug({ userId, systemName }, 'Trust profile saved');
    return true;
  } catch (error) {
    log.error({ error, userId, systemName }, 'Failed to save trust profile');
    return false;
  }
}
