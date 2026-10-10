/**
 * Find a user by a linked identifier (a second phone number, an auth id) with
 * one indexed Firestore query instead of listing every profile.
 *
 * Profiles keep `linkedIdentifiers` as a top-level string array on their
 * bogle_users document, so `array-contains-any` matches it with Firestore's
 * automatic single-field index. Phone identification calls this at the start
 * of a call; the old scan read up to 1000 profile documents each time (1.3 s on
 * dev) and missed anyone past the first 1000.
 *
 * @module memory/storage/firestore-linked-identifier
 */

import type { UserProfile } from '../../types/user-profile.js';
import { isValidUserProfile } from '../type-guards.js';

/** The part of a Firestore client this needs (FirestoreStore's client fits it). */
export interface LinkedIdentifierDb {
  collection: (path: string) => {
    where: (
      field: string,
      op: string,
      value: unknown
    ) => {
      limit: (n: number) => {
        get: () => Promise<{ docs: Array<{ data: () => Record<string, unknown> | undefined }> }>;
      };
    };
  };
}

/** Firestore's limit on values in one array-contains-any filter. */
export const MAX_ANY_VALUES = 30;

export async function queryProfileByLinkedIdentifier(
  db: LinkedIdentifierDb,
  collection: string,
  candidates: readonly string[],
  hydrate: (data: Record<string, unknown>) => Record<string, unknown>
): Promise<UserProfile | null> {
  const values = [...new Set(candidates.filter(Boolean))].slice(0, MAX_ANY_VALUES);
  if (values.length === 0) return null;
  const snapshot = await db
    .collection(collection)
    .where('linkedIdentifiers', 'array-contains-any', values)
    .limit(5)
    .get();
  for (const doc of snapshot.docs) {
    const data = doc.data();
    if (!data) continue;
    const hydrated = hydrate(data);
    if (isValidUserProfile(hydrated)) return hydrated as unknown as UserProfile;
  }
  return null;
}
