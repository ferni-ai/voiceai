/**
 * Which account an inbound text belongs to: the one account whose VERIFIED
 * phone is the sender's number, or none (the webhook's `unknown`).
 *
 * Verified means the same sources as verifiedPhoneOf / resolveVerifiedPhone
 * (user-reach.ts), read in reverse, each by key or by one indexed field:
 * - bogle_users/phone:<E.164>, a phone-first account (its id is the caller ID);
 * - a bogle_users record whose linkedIdentifiers hold `phone:<E.164>`, put there
 *   only after a texted or called code (linkPhoneToProfile), through Firestore's
 *   automatic single-field array index, the one erasure-keys.ts already uses;
 * - the Firebase account whose sign-in phone it is (attachVerifiedPhone, the
 *   Settings verify-phone flow; unique in Auth).
 *
 * Never profile.contactInfo.phone: the model (saveContactInfo) and
 * POST /api/user/contact write it with no proof, so it may be anyone's number.
 * Never a scan: the old lookup listed 1,000 profiles per text, took the first
 * match, and missed every account past them (#3169).
 *
 * Precedence, as for calls (caller-recognition.ts, whose ownerOf is the Firebase
 * owner of the number and nothing else): the Firebase account whose sign-in
 * phone it is IS the owner, over any phone: record or linked identifier. Settings
 * verification puts the number only there, so someone who called first (a
 * phone:<E.164> record) and verified later stays one person, the Firebase one.
 * Only when Firebase says no user has the number are the Firestore records read:
 * a record moved to another account (_migratedTo, migration-flag.ts) counts as
 * that account, and more than one owner there is a data error: unknown, never the
 * first. A failed read, Auth included (an Auth error or an Admin SDK that isn't
 * initialized), is unknown too, never "no Firebase owner". No phone number or
 * account id is logged (a `phone:` id holds the number).
 *
 * @module services/outreach/webhooks/sms-sender-account
 */

import { getLogger } from '../../../utils/safe-logger.js';
import { getFirebaseUserByPhoneOrThrow } from '../../identity/firebase-auth.js';
import { migratedToOf } from '../../identity/migration-flag.js';
import { getFirestoreDb } from '../../../utils/firestore-utils.js';
import { toE164 } from '../checkin-replies.js';

const log = getLogger().child({ module: 'sms-sender-account' });

const USERS = 'bogle_users';
/** A number linked to this many records is treated as ambiguous without reading further. */
export const MAX_LINKED = 10;

interface AccountDoc {
  id: string;
  data: Record<string, unknown>;
}

/** The indexed reads behind the match. */
export interface VerifiedPhoneIndex {
  /** bogle_users/phone:<e164>, or null when there is no such record. */
  phoneAccount: (e164: string) => Promise<AccountDoc | null>;
  /** Up to `limit` bogle_users records whose linkedIdentifiers hold `phone:<e164>`. */
  linkedAccounts: (e164: string, limit: number) => Promise<AccountDoc[]>;
  /** The uid of the Firebase account whose sign-in phone is e164, null when none; throws when unsure. */
  authAccount: (e164: string) => Promise<string | null>;
}

function db(): NonNullable<ReturnType<typeof getFirestoreDb>> {
  const firestore = getFirestoreDb();
  // Without it a second owner can't be ruled out, so nothing is matched.
  if (!firestore) throw new Error('Firestore not available');
  return firestore;
}

/** The production reads: Firestore and Firebase Auth. */
const firestoreVerifiedPhoneIndex: VerifiedPhoneIndex = {
  async phoneAccount(e164) {
    const snap = await db().collection(USERS).doc(`phone:${e164}`).get();
    return snap.exists ? { id: snap.id, data: snap.data() ?? {} } : null;
  },
  async linkedAccounts(e164, limit) {
    const snap = await db()
      .collection(USERS)
      .where('linkedIdentifiers', 'array-contains', `phone:${e164}`)
      .limit(limit)
      .get();
    return snap.docs.map((d) => ({ id: d.id, data: d.data() ?? {} }));
  },
  async authAccount(e164) {
    return (await getFirebaseUserByPhoneOrThrow(e164))?.uid ?? null;
  },
};

/** True when this record holds e164 as a verified phone (its id, or a `phone:` link). */
function holdsVerified(doc: AccountDoc, e164: string): boolean {
  const key = `phone:${e164}`;
  const links = doc.data.linkedIdentifiers;
  return doc.id === key || (Array.isArray(links) && links.includes(key));
}

/**
 * The id of the account whose verified phone is `from`: its Firebase owner, else
 * the one Firestore owner. Null when there is none, more than one, or a read failed.
 */
export async function findAccountByVerifiedPhone(
  from: string,
  index: VerifiedPhoneIndex = firestoreVerifiedPhoneIndex
): Promise<string | null> {
  const e164 = toE164(from);
  if (!e164) return null;
  try {
    const authUid = await index.authAccount(e164);
    if (authUid) return authUid; // the Firebase owner wins, as for calls
    const [own, linked] = await Promise.all([
      index.phoneAccount(e164),
      index.linkedAccounts(e164, MAX_LINKED),
    ]);
    const owners = new Set<string>();
    for (const doc of [own, ...linked]) {
      if (doc && holdsVerified(doc, e164)) owners.add(migratedToOf(doc.data) ?? doc.id);
    }
    if (owners.size === 1 && linked.length < MAX_LINKED) return [...owners][0];
    if (owners.size > 1 || linked.length >= MAX_LINKED) {
      log.error(
        { accounts: owners.size, linkedRecords: linked.length },
        'Inbound SMS number is the verified phone of more than one account; treated as unknown'
      );
    }
    return null;
  } catch (error) {
    log.error({ error }, 'Inbound SMS sender lookup failed; treated as unknown');
    return null;
  }
}
