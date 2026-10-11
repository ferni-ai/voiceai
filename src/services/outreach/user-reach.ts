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
 * @module services/outreach/user-reach
 */

import { getFirestoreDb } from '../superhuman/firestore-utils.js';
import { consentFromPrefs } from './outreach-consent.js';

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
  opts: { standingOptIn: boolean }
): Promise<UserReach> {
  const db = getFirestoreDb();
  if (!db) return { reason: 'no_database' };
  const doc = await db.collection('bogle_users').doc(userId).get();
  const data = (doc.exists ? doc.data() : undefined) as Record<string, unknown> | undefined;
  const phone = verifiedPhoneOf(userId, data);
  if (!phone) return { reason: 'no_verified_phone' };
  if (opts.standingOptIn) {
    const consent = consentFromPrefs(data?.outreachPreferences);
    if (!consent.enabled || !consent.channels.includes(channel)) return { reason: 'not_opted_in' };
  }
  return { phone };
}
