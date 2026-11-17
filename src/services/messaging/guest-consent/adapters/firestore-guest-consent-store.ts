/**
 * The GuestConsentStore on Firestore: bogle_users/{ownerUid}/guest_consents/{phoneHash}.
 *
 * Under the owner, so erasing the owner's account erases it (bogle_users/{uid}
 * is erased recursively, platform/user-stores.ts). Server-only: firestore.rules
 * lists no rule for this subcollection, so the default denies every client
 * read and write. Never copied to the dev database (scripts/devdb/copy-user.ts):
 * it is other people's consent.
 *
 * @module services/messaging/guest-consent/adapters/firestore-guest-consent-store
 */
import type { DocumentReference, Firestore } from '@google-cloud/firestore';
import { isErasedOrErasing } from '../../../../utils/erasing-mark.js';
import { parseGuestConsent, type GuestConsent } from '../domain/guest-consent.js';
import type { GuestConsentStore } from '../ports/guest-consent-store.js';

const GUEST_CONSENTS = 'guest_consents';

const consentRef = (db: Firestore, ownerUid: string, hash: string): DocumentReference =>
  db.collection('bogle_users').doc(ownerUid).collection(GUEST_CONSENTS).doc(hash);

/** The record as written: no undefined fields (Firestore rejects them), no number. */
function toStored(consent: GuestConsent): Record<string, unknown> {
  return {
    wordingVersion: consent.wordingVersion,
    consentedAt: consent.consentedAt,
    ...(consent.revokedAt !== undefined && { revokedAt: consent.revokedAt }),
    ...(consent.keyVersion !== undefined && { keyVersion: consent.keyVersion }),
    history: consent.history,
  };
}

/** The port over `db` (getFirestoreDb()); with no database every call throws. */
export function firestoreGuestConsentStore(db: Firestore | null | undefined): GuestConsentStore {
  const need = (): Firestore => {
    if (!db) throw new Error('Firestore unavailable');
    return db;
  };
  return {
    async read(ownerUid, hash) {
      const firestore = need();
      const [account, snap] = await Promise.all([
        firestore.collection('bogle_users').doc(ownerUid).get(),
        consentRef(firestore, ownerUid, hash).get(),
      ]);
      if (isErasedOrErasing(account) || !snap.exists) return null;
      return parseGuestConsent(snap.data());
    },
    async update(ownerUid, hash, change) {
      const firestore = need();
      const ref = consentRef(firestore, ownerUid, hash);
      const account = firestore.collection('bogle_users').doc(ownerUid);
      await firestore.runTransaction(async (tx) => {
        const erased = isErasedOrErasing(await tx.get(account));
        const snap = await tx.get(ref);
        const next = change(snap.exists ? parseGuestConsent(snap.data()) : null);
        if (!next) return;
        // As putUnlessErased: an account gone or being erased gets no new consent,
        // and a withdrawal there deletes the record rather than keep one under it.
        if (!erased) tx.set(ref, toStored(next));
        else if (next.revokedAt !== undefined) tx.delete(ref);
      });
    },
  };
}
