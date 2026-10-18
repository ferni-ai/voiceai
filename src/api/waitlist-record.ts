/**
 * Writes to a person's waitlist record from the access check, including a
 * friend's referral code.
 *
 * A friend who opens a referral link while the waitlist gate is on can't use the
 * app yet, so the code would be lost before their first conversation. The web
 * sends it with the access check (/api/waitlist/check?referralCode=); the record
 * keeps it, and the check hands it back once they're approved, on any device.
 * Registering it (and paying seeds) stays with /api/seeds/referral.
 */

import type { IncomingMessage } from 'http';
import type { DocumentReference, DocumentSnapshot } from 'firebase-admin/firestore';
import { getFirestoreDb } from '../utils/firestore-utils.js';
import { joinWaitlist } from '../services/waitlist/join.js';
import { firestoreWaitlistStore } from '../services/waitlist/store.js';

/** The shape seeds-routes.ts generates: `k3j9x2-meadow`. */
const REFERRAL_CODE_PATTERN = /^[a-z0-9]+-[a-z]+$/;

/**
 * The code on this person's waitlist record, or else a valid one offered with
 * this check. An offered code is written onto an existing record now; a record
 * that doesn't exist yet takes it from its first write (addSigninToWaitlist).
 */
export async function keepWaitlistReferral(
  req: IncomingMessage,
  waitlistRef: DocumentReference,
  waitlistDoc: DocumentSnapshot
): Promise<string | undefined> {
  const stored: unknown = waitlistDoc.data()?.referralCode;
  if (typeof stored === 'string' && stored) return stored;

  const offered = new URL(req.url ?? '/', 'http://local').searchParams.get('referralCode');
  if (!offered || !REFERRAL_CODE_PATTERN.test(offered)) return undefined;
  // Only before the person's first verification: a code added later never earns credit
  if (waitlistDoc.exists && !waitlistDoc.data()?.verifiedAt) await waitlistRef.set({ referralCode: offered }, { merge: true }); // prettier-ignore
  return offered;
}

/** First sign-in with the gate on: in line as a verified person, with the friend's code if one came. */
export async function addSigninToWaitlist(
  email: string,
  referralCode: string | undefined,
  uid: string
): Promise<void> {
  // prettier-ignore
  const db = getFirestoreDb();
  if (!db) throw new Error('Firestore unavailable');
  await joinWaitlist(firestoreWaitlistStore(db), { email, uid, verified: true, ref: referralCode, source: 'app_signin', now: new Date() }); // prettier-ignore
}

/** The friend's code offered with this request only (a stored one may have been planted). */
export function offeredReferral(req: IncomingMessage): string | undefined {
  const offered = new URL(req.url ?? '/', 'http://local').searchParams.get('referralCode');
  return offered && REFERRAL_CODE_PATTERN.test(offered) ? offered : undefined;
}
