/**
 * Who gets into the app after signing in.
 *
 * Open by default (decided 2026-10-03): everyone who signs in gets the free
 * tier straight away. Before, every new sign-in landed on a waitlist as
 * "pending" until someone approved it by hand, so 37 people who tried the app
 * never got in. WAITLIST_GATE=on restores the gate without a deploy of code.
 *
 * @module api/open-access
 */
import type { Firestore } from 'firebase-admin/firestore';
import { cleanForFirestore } from '../utils/firestore-utils.js';

export function waitlistGateOn(env: NodeJS.ProcessEnv = process.env): boolean {
  return env['WAITLIST_GATE'] === 'on';
}

export interface AccessGrant {
  email: string;
  uid: string;
  tier: 'free' | 'partner';
  grantedVia: 'open-access' | 'waitlist-approval-auto';
  /** How long it lasts; omitted for a free tier that doesn't expire. */
  years?: number;
}

/** Give a signed-in person access: their profile gets an active subscription. */
export async function grantAccess(db: Firestore, profileDocId: string, grant: AccessGrant): Promise<void> {
  const now = new Date();
  await db
    .collection('user_profiles')
    .doc(profileDocId)
    .set(
      cleanForFirestore({
        email: grant.email,
        firebaseUid: grant.uid,
        subscription: {
          tier: grant.tier,
          status: 'active',
          subscribedAt: now,
          currentPeriodEnd: grant.years
            ? new Date(now.getTime() + 1000 * 60 * 60 * 24 * 365 * grant.years)
            : undefined,
          grantedVia: grant.grantedVia,
        },
        createdAt: now,
        updatedAt: now,
      }),
      { merge: true }
    );
}
