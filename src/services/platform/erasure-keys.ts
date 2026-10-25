/**
 * Who the person is besides their uid, read before anything is erased: the keys the
 * stores in erase-other-keys.ts are deleted by, the phone profiles that are the same
 * person, and the Stripe customer billing still has to close.
 *
 * A key counts only when something proved it is the person's, because deleting by
 * anyone else's would erase their data:
 * - emails: the one Firebase verified, and those on the person's access grants
 *   (user_profiles with their firebaseUid; written only for a verified sign-in,
 *   waitlist-routes.ts). Not profile contactInfo.email, which anyone can type.
 * - phones: the one on the Firebase account (Firebase verifies it by text), and the
 *   `phone:` links on their record (linkPhoneToProfile, after a texted code).
 * - phone profiles (bogle_users/phone:{e164}): one of those phones, or one that linked
 *   this sign-in (`auth:{provider}:{uid}`, linkWebAuthToPhone). A phone profile that
 *   linked any other sign-in, even alongside this one, is left alone (and logged).
 *   The sign-in links are looked up under every provider Firebase signs people in
 *   with, not only those on the account: once the Firebase user is gone its provider
 *   list is too, and a link under `auth:google.com:{uid}` must still be found.
 *
 * The Firebase lookup must succeed: a lookup that fails for any reason other than
 * "no such user" throws, so the erasure is reported as failed and can be retried,
 * instead of skipping the email-keyed stores and reporting success. When the user
 * is already gone from Firebase (Apple or a GDPR request deleted it), the keys come
 * from the grants and links above.
 *
 * @module services/platform/erasure-keys
 */

import { getFirebaseUserOrThrow } from '../identity/firebase-auth.js';
import { normalizePhoneNumber } from '../identity/user-identification.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'erasure-keys' });

type Db = FirebaseFirestore.Firestore;
type Snap = FirebaseFirestore.DocumentSnapshot;

export interface ErasureKeys {
  userId: string;
  /** Phone profiles that are the same person; each is erased like the uid */
  linkedUserIds: string[];
  /** The person's E.164 numbers (Firebase sign-in, linked phone: profiles) */
  phones: string[];
  /** Verified email addresses, lower-cased as the writers store them */
  emails: string[];
  /** sponsored_identities the person sponsors; their phone index entries go with them */
  sponsoredIdentityIds: string[];
  /** Kept for billing to close once the profiles holding them are gone */
  stripeCustomerIds: string[];
}

/** The document id the waitlist and user_profiles writers derive from an email (waitlist-routes.ts) */
export const emailDocId = (email: string): string =>
  Buffer.from(email).toString('base64').replace(/[/+=]/g, '_');

/** Firestore's limit on the values of an 'in' or 'array-contains-any' query */
export const IN_LIMIT = 30;

export const chunks = <T>(values: readonly T[], size = IN_LIMIT): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < values.length; i += size) out.push(values.slice(i, i + size));
  return out;
};

const unique = (values: Array<string | undefined>): string[] => [
  ...new Set(values.filter((v): v is string => !!v)),
];

/**
 * The provider ids linkWebAuthToPhone can be given ('default' is its own default):
 * Firebase's built-in sign-in providers. A custom OIDC or SAML provider is found only
 * while the Firebase user, and so its provider list, still exists.
 */
const SIGN_IN_PROVIDERS = [
  'default',
  'anonymous',
  'password',
  'phone',
  'google.com',
  'apple.com',
  'facebook.com',
  'github.com',
  'twitter.com',
  'microsoft.com',
  'yahoo.com',
  'gamecenter.apple.com',
  'playgames.google.com',
] as const;

const E164 = /^\+\d{7,15}$/;
const PHONE_PROFILE = 'phone:';

const stringField = (snap: Snap, field: string): string | undefined => {
  const value: unknown = snap.get(field);
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
};

const links = (snap: Snap): string[] => {
  const value: unknown = snap.get('linkedIdentifiers');
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
};

/** A phone profile that linked any other sign-in is that person's too, so it is never erased */
const linkedElsewhere = (snap: Snap, userId: string): boolean =>
  links(snap).some((l) => l.startsWith('auth:') && !l.endsWith(`:${userId}`));

async function phoneProfiles(
  db: Db,
  userId: string,
  phones: string[],
  providers: string[]
): Promise<Snap[]> {
  const byPhone = await Promise.all(
    phones.map(async (phone) => db.collection('bogle_users').doc(`${PHONE_PROFILE}${phone}`).get())
  );
  const authLinks = providers.map((p) => `auth:${p}:${userId}`);
  const byAuth = await Promise.all(
    chunks(authLinks).map(async (values) =>
      db.collection('bogle_users').where('linkedIdentifiers', 'array-contains-any', values).get()
    )
  );
  const found = new Map<string, Snap>();
  // A proven phone's profile stays in scope with its record gone (an earlier attempt
  // erased it), so a retry still reaches what is left under it
  for (const snap of [...byPhone, ...byAuth.flatMap((s) => s.docs)]) {
    if (snap.id === userId) continue;
    if (linkedElsewhere(snap, userId)) {
      log.warn({ userId }, 'Phone profile linked to another sign-in; not erased with this account');
      continue;
    }
    found.set(snap.id, snap);
  }
  return [...found.values()];
}

const stripeIds = (snaps: Snap[]): string[] =>
  unique(
    snaps.flatMap((s) => [
      stringField(s, 'subscription.stripeCustomerId'),
      stringField(s, 'stripeCustomerId'),
    ])
  );

/** Read before anything is erased: the sweep erases the records the keys are read from */
export async function gatherErasureKeys(db: Db, userId: string): Promise<ErasureKeys> {
  const [user, grants, record, garden] = await Promise.all([
    getFirebaseUserOrThrow(userId),
    db.collection('user_profiles').where('firebaseUid', '==', userId).get(),
    db.collection('bogle_users').doc(userId).get(),
    db.collection('user_gardens').doc(userId).get(),
  ]);
  const emails = unique(
    [
      user?.emailVerified === true ? user.email : undefined,
      ...grants.docs.map((d) => stringField(d, 'email')),
    ].map((e) => e?.toLowerCase().trim())
  );
  const phones = unique(
    [
      user?.phoneNumber ?? undefined,
      ...links(record)
        .filter((l) => l.startsWith(PHONE_PROFILE))
        .map((l) => l.slice(PHONE_PROFILE.length)),
    ].map((p) => (p ? normalizePhoneNumber(p) : undefined))
  ).filter((p) => E164.test(p));
  const providers = unique([
    ...SIGN_IN_PROVIDERS,
    ...(user?.providerData.map((p) => p.providerId) ?? []),
  ]);
  const linked = await phoneProfiles(db, userId, phones, providers);
  const linkedUserIds = linked.map((s) => s.id);

  const [emailGrants, sponsored] = await Promise.all([
    Promise.all(emails.map(async (e) => db.collection('user_profiles').doc(emailDocId(e)).get())),
    Promise.all(
      chunks([userId, ...linkedUserIds]).map(async (ids) =>
        db.collection('sponsored_identities').where('sponsorUserId', 'in', ids).get()
      )
    ),
  ]);
  const owned = emailGrants.filter((s) => {
    const owner: unknown = s.get('firebaseUid');
    return s.exists && (owner === undefined || owner === null || owner === userId);
  });
  return {
    userId,
    linkedUserIds,
    phones: unique([
      ...phones,
      ...linkedUserIds
        .filter((id) => id.startsWith(PHONE_PROFILE))
        .map((id) => id.slice(PHONE_PROFILE.length)),
    ]),
    emails,
    sponsoredIdentityIds: sponsored.flatMap((s) => s.docs.map((d) => d.id)),
    stripeCustomerIds: stripeIds([record, garden, ...grants.docs, ...owned, ...linked]),
  };
}

/**
 * Keep the Stripe customer ids the erasure is about to delete the only pointer to,
 * so billing can close them (that needs a human: it is a billing change). The record
 * holds the customer id alone, not who the person was.
 */
export async function keepStripeCustomersForCleanup(db: Db, ids: readonly string[]): Promise<void> {
  await Promise.all(
    ids
      .filter((id) => !id.includes('/'))
      .map(async (stripeCustomerId) =>
        db
          .collection('billing_cleanup')
          .doc(stripeCustomerId)
          .set(
            { stripeCustomerId, reason: 'account_deleted', recordedAt: new Date().toISOString() },
            { merge: true }
          )
      )
  );
  if (ids.length > 0)
    log.warn({ stripeCustomerIds: ids }, 'Stripe customers left for billing cleanup');
}
