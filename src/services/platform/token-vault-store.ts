/**
 * Firestore persistence for the privacy-crypto token vault (token → original value).
 *
 * Split out of privacy-crypto.ts so the vault binds the process's database: it went
 * through `admin.firestore()`, which always opens '(default)', so a dev process
 * (FIRESTORE_DATABASE=ferni-dev) read and wrote prod's vault. getAdminFirestore()
 * binds getFirestoreDatabase(), and is called on first use, not at import.
 *
 * Every call degrades to "not persisted" (undefined / null) when Firestore is
 * unavailable, as before; the in-memory caches stay in privacy-crypto.ts.
 *
 * @module services/platform/token-vault-store
 */

import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { getAdminFirestore } from '../../utils/firebase-admin-app.js';
import { removeUndefined } from '../../utils/firestore-utils.js';
import { getLogger } from '../../utils/safe-logger.js';

const log = getLogger();

export const TOKEN_VAULT_COLLECTION = 'token_vault';

function getDb(): Firestore | null {
  try {
    return getAdminFirestore();
  } catch {
    return null;
  }
}

/** Save a token to Firestore. */
export async function saveTokenToFirestore(
  token: string,
  value: string,
  category: string
): Promise<void> {
  const db = getDb();
  if (!db) return;

  try {
    await db
      .collection(TOKEN_VAULT_COLLECTION)
      .doc(token)
      .set(removeUndefined({ value, category, createdAt: FieldValue.serverTimestamp() }));
  } catch (error) {
    log.error({ error, token }, 'Failed to save token to Firestore');
  }
}

/** Load a token's value from Firestore. */
export async function loadTokenFromFirestore(token: string): Promise<string | null> {
  const db = getDb();
  if (!db) return null;

  try {
    const doc = await db.collection(TOKEN_VAULT_COLLECTION).doc(token).get();
    if (doc.exists) {
      const data = doc.data();
      return data?.value || null;
    }
  } catch (error) {
    log.error({ error, token }, 'Failed to load token from Firestore');
  }
  return null;
}

/** The token a value already has in Firestore, if any. */
export async function findExistingToken(value: string, category: string): Promise<string | null> {
  const db = getDb();
  if (!db) return null;

  try {
    const snapshot = await db
      .collection(TOKEN_VAULT_COLLECTION)
      .where('value', '==', value)
      .where('category', '==', category)
      .limit(1)
      .get();

    if (!snapshot.empty) {
      return snapshot.docs[0].id;
    }
  } catch (error) {
    log.error({ error }, 'Failed to find existing token');
  }
  return null;
}
