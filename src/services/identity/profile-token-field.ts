/**
 * Token fields that live on the user profile (bogle_users/{uid}.linkedInTokens,
 * .biometricTokens).
 *
 * Why not store.saveProfile: it writes with merge:true after a JSON round-trip,
 * so a nested map is deep-merged (legacy plaintext subfields survive beside the
 * sealed record) and a deleted key is simply left in Firestore. On the
 * Firestore store we write the one field with update(): a map value replaces
 * the whole field, and FieldValue.delete() really removes it.
 */

import { FieldValue, type Firestore } from '@google-cloud/firestore';
import { getStore } from '../../memory/store-factory.js';
import type { SealedTokens } from '../../utils/token-at-rest.js';

const USERS_COLLECTION = 'bogle_users';
const NOT_FOUND = 5; // gRPC status for update() on a missing document

interface FirestoreBackedStore {
  getDatabase: () => Promise<Firestore>;
}

function isFirestoreBacked(store: object): store is FirestoreBackedStore {
  return typeof (store as Partial<FirestoreBackedStore>).getDatabase === 'function';
}

/** The raw stored value of a profile token field (sealed or legacy plaintext). */
export async function readProfileTokenField(userId: string, field: string): Promise<unknown> {
  const store = await getStore();
  const profile = await store.getProfile(userId);
  return profile ? (profile as unknown as Record<string, unknown>)[field] : undefined;
}

/**
 * Replace the field with a sealed record, or remove it entirely when `value`
 * is null. Throws on a write failure so callers can log it.
 */
export async function writeProfileTokenField(
  userId: string,
  field: string,
  value: SealedTokens | null
): Promise<void> {
  const store = await getStore();

  if (isFirestoreBacked(store)) {
    if (value) await store.getOrCreateProfile(userId); // update() needs the doc
    const db = await store.getDatabase();
    try {
      await db
        .collection(USERS_COLLECTION)
        .doc(userId)
        .update({ [field]: value ?? FieldValue.delete() });
    } catch (error) {
      // Removing from a profile that does not exist: nothing is stored.
      if (!value && (error as { code?: unknown }).code === NOT_FOUND) return;
      throw error;
    }
    return;
  }

  // In-memory / Postgres stores replace the whole profile object.
  const profile = value ? await store.getOrCreateProfile(userId) : await store.getProfile(userId);
  if (!profile) return;
  const next = { ...profile } as unknown as Record<string, unknown>;
  if (value) next[field] = value;
  else delete next[field];
  await store.saveProfile(next as unknown as typeof profile);
}
