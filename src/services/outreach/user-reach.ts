/**
 * The phone we may use to reach a user ourselves: only the number on their
 * account, never one the model supplies.
 *
 * - A phone-first account's id is `phone:<E.164>` (the caller ID it was made from).
 * - A web account has a phone in `linkedIdentifiers` (`phone:<E.164>`) only after
 *   the user proved they can receive texts or calls there (linkPhoneToProfile).
 *
 * `profile.contactInfo.phone` is NOT used: the model writes it (saveContactInfo)
 * from whatever was said, so it may be anyone's number.
 *
 * resolveVerifiedPhone is the one answer to "which number do we text or ring
 * for this member": it adds a sponsor-confirmed phone and Firebase Auth's
 * phone (set only by SMS verification) to the above.
 *
 * @module services/outreach/user-reach
 */

import { getFirestoreDb } from '../superhuman/firestore-utils.js';
import { getFirebaseUser } from '../identity/firebase-auth.js';
import { toE164 } from './checkin-replies.js';
import { consentFromPrefs } from './outreach-consent.js';
import { flagOn } from '../../config/env-flag.js';

/**
 * A sponsor typed this number; it isn't proven to be the holder's. With
 * MESSAGING_PIPELINE on it counts as the account's own only once the holder
 * verified it themselves (phoneVerifiedAt on the sponsored identity, set by a
 * texted-code check); until then no outbound treats it as theirs.
 */
export function sponsoredPhoneOf(data: Record<string, unknown> | undefined): string | undefined {
  const phone = data?.phoneNumber;
  if (typeof phone !== 'string') return undefined;
  if (flagOn('MESSAGING_PIPELINE') && typeof data?.phoneVerifiedAt !== 'string') return undefined;
  return phone;
}

const E164 = /^\+[1-9]\d{7,14}$/;

function phoneFromIdentifier(id: unknown): string | undefined {
  if (typeof id !== 'string' || !id.startsWith('phone:')) return undefined;
  const phone = id.slice('phone:'.length);
  return E164.test(phone) ? phone : undefined;
}

/** The verified phone for this account, from its id or its linked identifiers. */
export function verifiedPhoneOf(
  userId: string,
  userDoc?: Record<string, unknown>
): string | undefined {
  const own = phoneFromIdentifier(userId);
  if (own) return own;
  const links = Array.isArray(userDoc?.linkedIdentifiers) ? userDoc.linkedIdentifiers : [];
  for (const link of links) {
    const phone = phoneFromIdentifier(link);
    if (phone) return phone;
  }
  return undefined;
}

/** Where resolveVerifiedPhone looks beyond the account's id and linked identifiers. */
export interface VerifiedPhoneSources {
  /** sponsored_identities/{id}.phoneNumber: the number a sponsor confirmed for a sponsored_ account. */
  sponsoredPhone: (userId: string) => Promise<string | undefined>;
  /** The Firebase Auth phoneNumber, which only phone verification (or an admin) sets. */
  authPhone: (uid: string) => Promise<string | undefined>;
}

/** The production sources: Firestore and Firebase Auth. */
export const accountPhoneSources: VerifiedPhoneSources = {
  async sponsoredPhone(userId) {
    const db = getFirestoreDb();
    if (!db) return undefined;
    const doc = await db.collection('sponsored_identities').doc(userId).get();
    return sponsoredPhoneOf(doc.exists ? doc.data() : undefined);
  },
  async authPhone(uid) {
    return (await getFirebaseUser(uid))?.phoneNumber ?? undefined;
  },
};

/**
 * The number we may text or ring this member on, as E.164 (toE164, the same
 * normalizer the reply side hashes with), or undefined. In order:
 *
 * 1. a `sponsored_` account: the number its sponsor confirmed, and nothing else;
 * 2. verifiedPhoneOf: a `phone:` id, else a phone in `linkedIdentifiers` (proved
 *    in Settings by linkPhoneToProfile, so a Google sign-in can have one);
 * 3. the Firebase Auth phone, looked up only for a real Firebase uid (never a
 *    `phone:` id, which isn't one).
 *
 * Never `contactInfo.phone`, which the model writes from whatever was said.
 */
export async function resolveVerifiedPhone(
  userId: string,
  userDoc: Record<string, unknown> | undefined,
  sources: VerifiedPhoneSources = accountPhoneSources
): Promise<string | undefined> {
  const sponsored = userId.startsWith('sponsored_');
  let phone = sponsored ? await sources.sponsoredPhone(userId) : verifiedPhoneOf(userId, userDoc);
  if (!phone && !sponsored && !userId.startsWith('phone:')) phone = await sources.authPhone(userId);
  return phone === undefined ? undefined : (toE164(phone) ?? undefined);
}

export type UserReach =
  | { phone: string }
  | { phone?: undefined; reason: 'no_verified_phone' | 'not_opted_in' | 'no_database' };

/**
 * Where we may text or call this user. `standingOptIn` asks for the channel to
 * be on in their outreach settings (needed for anything they didn't ask for
 * just now); a direct request ("text me") only needs the verified phone.
 */
export async function userReach(
  userId: string,
  channel: 'sms' | 'voice_call',
  opts: { standingOptIn: boolean },
  sources: VerifiedPhoneSources = accountPhoneSources
): Promise<UserReach> {
  const db = getFirestoreDb();
  if (!db) return { reason: 'no_database' };
  const doc = await db.collection('bogle_users').doc(userId).get();
  const data = (doc.exists ? doc.data() : undefined) as Record<string, unknown> | undefined;
  // The same number every other sender uses: a Google sign-in that verified its phone in
  // Settings has it on Firebase Auth only, which verifiedPhoneOf alone never saw.
  const phone = await resolveVerifiedPhone(userId, data, sources);
  if (!phone) return { reason: 'no_verified_phone' };
  if (opts.standingOptIn) {
    const consent = consentFromPrefs(data?.outreachPreferences);
    if (!consent.enabled || !consent.channels.includes(channel)) return { reason: 'not_opted_in' };
  }
  return { phone };
}
