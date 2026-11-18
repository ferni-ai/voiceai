/**
 * The GuestInviteStore on Firestore: guest_invites/{sha256(token)} in the shared
 * single-use store (stores/single-use-records.ts), as connect invites use it.
 * Taking an invite deletes it. Server-only (firestore.rules' default deny), erased
 * with the owner (ERASED_STORES), never copied to dev (copy-user.ts), and swept
 * by ttlAt (firestore.indexes.json).
 *
 * @module services/messaging/guest-consent/adapters/firestore-guest-invite-store
 */
import { firestoreSingleUseStore } from '../../../stores/single-use-records.js';
import { getFirestoreDb } from '../../../../utils/firestore-utils.js';
import type { GuestInvite } from '../domain/guest-invite.js';
import type { GuestInviteStore } from '../ports/guest-invite-store.js';

const GUEST_INVITES = 'guest_invites';

export function firestoreGuestInviteStore(): GuestInviteStore {
  return firestoreSingleUseStore<GuestInvite>(GUEST_INVITES);
}

/** The owner's name from their account, as messaging/consent-grants.ts ownerFirstName reads it. */
export async function readOwnerName(uid: string): Promise<unknown> {
  const db = getFirestoreDb();
  if (!db) throw new Error('Firestore unavailable');
  const data = (await db.collection('bogle_users').doc(uid).get()).data();
  const displayName: unknown = data?.displayName;
  return typeof displayName === 'string' && displayName.trim() !== '' ? displayName : data?.name;
}
