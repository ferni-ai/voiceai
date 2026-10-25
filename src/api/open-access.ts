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
  grantedVia: 'open-access' | 'waitlist-approval-auto' | 'admission';
  /** How long it lasts; omitted for a free tier that doesn't expire. */
  years?: number;
  /** Admitted from the waitlist: the founding-member perk and the wave they came in with. */
  foundingWave?: number;
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
        ...(grant.foundingWave === undefined
          ? {}
          : { foundingMember: true, foundingWave: grant.foundingWave }),
        createdAt: now,
        updatedAt: now,
      }),
      { merge: true }
    );
}

/**
 * An admin approval (API or the emailed link): the free tier plus the founding-member perk,
 * which replaced the 10-year partner grant (decided 2026-10-18). A profile that already has an
 * active subscription keeps its own tier and only gains the founding fields.
 */
export async function grantFoundingMember(
  db: Firestore,
  profileDocId: string,
  person: { email: string; phone: string | null }
): Promise<void> {
  const ref = db.collection('user_profiles').doc(profileDocId);
  const now = new Date();
  const founding = { foundingMember: true, foundingWave: 0, updatedAt: now };
  const existing = (await ref.get()).data() as { subscription?: { status?: string } } | undefined;
  if (existing?.subscription?.status === 'active') {
    await ref.set(founding, { merge: true });
    return;
  }
  const subscription = {
    tier: 'free',
    status: 'active',
    subscribedAt: now,
    inTrial: false,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    grantedVia: 'waitlist-approval',
    monthlyUsage: { conversationCount: 0, minutesTalked: 0, lastUpdated: now },
  };
  await ref.set(cleanForFirestore({ ...person, ...founding, subscription, createdAt: now }), { merge: true }); // prettier-ignore
}
