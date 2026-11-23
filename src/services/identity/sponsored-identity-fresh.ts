/**
 * The sponsored identity on a number, read from Firestore on every call: the
 * phone index doc, then the identity doc. lookupByPhone (sponsored-identity.ts)
 * answers from process-lifetime caches, so in a long-lived agent process a
 * revoked identity, a changed relationship or sponsor, or a number moved to a
 * new holder is never seen. An authorization decision (the family circle) reads
 * here instead. Read failures throw; the caller treats them as a refusal.
 *
 * @module services/identity/sponsored-identity-fresh
 */
import { getAdminFirestore } from '../../utils/firebase-admin-app.js';
import {
  COLLECTION_NAME,
  PHONE_INDEX_COLLECTION,
  docToIdentity,
  type SponsoredIdentity,
} from './sponsored-identity.js';

/** The identity the index names for this E.164 number, or null when there is none. */
export async function readSponsoredIdentityByPhoneFresh(
  e164: string
): Promise<SponsoredIdentity | null> {
  const db = getAdminFirestore();
  const index = await db.collection(PHONE_INDEX_COLLECTION).doc(e164).get();
  const identityId: unknown = index.exists ? index.data()?.identityId : undefined;
  if (typeof identityId !== 'string' || !identityId) return null;
  const doc = await db.collection(COLLECTION_NAME).doc(identityId).get();
  return doc.exists ? docToIdentity(doc) : null;
}
