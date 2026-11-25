/**
 * Who may use Ferni while WAITLIST_GATE=on: one answer for every entry point
 * (the voice token route, text chat, and /api/waitlist/check), so the gate
 * isn't a web-only screen that a reload or a direct API call walks past.
 *
 * Admitted, any one of:
 *  - an admin address (ADMIN_BYPASS_EMAILS) or the owner's (OWNER_EMAIL);
 *  - a waitlist entry that is approved / admitted / joined;
 *  - an active subscription (user_profiles, or legacy bogle_users), which
 *    open access gave everyone who signed in since 2026-10-03;
 *  - an account created before WAITLIST_GATE_SINCE (ISO date; unset = no one
 *    is grandfathered by date);
 *  - a member of the friends-and-family cohort while it is enabled (wave 0).
 * Emails count only when the caller's token says they're verified.
 *
 * Gate off: everyone is admitted and nothing is read. Gate on: a lookup that
 * fails refuses (fails closed) and is not cached; answers are cached 60 s.
 * DURABLE_ACCESS_GRANTS (#2264): an approval or subscription stored for a
 * reason that ends (open access, admission) counts only through the live rules.
 *
 * @module api/admission
 */
import type { ServerResponse } from 'http';
import type { Firestore } from '@google-cloud/firestore';
import { waitlistGateOn } from './open-access.js';
import { getFirestoreDb } from '../utils/firestore-utils.js';
import { isCohortMember } from '../services/platform/cohort-membership.js';
import { createLogger } from '../utils/safe-logger.js';
import { isOwnerEmail } from '../config/owner-email.js';
import { ADMITTED_STATUSES } from '../services/waitlist/queue.js';
import {
  durableGrantsActive,
  livePaidPlan,
  subscriptionAdmits,
  waitlistEntryAdmits,
  type StoredSubscription,
  type StoredWaitlistEntry,
} from './access-grant-standing.js';

const log = createLogger({ module: 'Admission' });

/**
 * Admin addresses: never blocked. Exact strings. The owner's own address is not
 * here: it comes from OWNER_EMAIL (a secret; this repo is public), see isAdminEmail.
 */
export const ADMIN_BYPASS_EMAILS: readonly string[] = ['noreply@ferni.ai', 'admin@ferni.ai'];

/** An admin address, or the owner's (OWNER_EMAIL, Gmail dots folded). False for no email. */
export function isAdminEmail(
  email: string | undefined,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  if (!email) return false;
  return ADMIN_BYPASS_EMAILS.includes(email) || isOwnerEmail(email, env);
}

export const ADMISSION_COHORT = 'friends-and-family';
export const ADMISSION_CACHE_TTL_MS = 60_000;

export type AdmissionReason =
  | 'gate-off'
  | 'admin'
  | 'waitlist-approved'
  | 'active-account'
  | 'existing-account'
  | 'friends-and-family'
  | 'not-admitted'
  | 'check-failed';

export interface Admission {
  admitted: boolean;
  reason: AdmissionReason;
}

/** The caller: a Firebase uid, plus their email only if the token says it is verified. */
export interface Who {
  uid: string;
  email?: string;
}

export interface AdmissionStore {
  waitlistStatus: (email: string) => Promise<string | undefined>;
  hasActiveSubscription: (email: string) => Promise<boolean>;
  accountCreatedAt: (uid: string) => Promise<Date | null>;
  inCohort: (cohort: string, uid: string) => Promise<boolean>;
  /** DURABLE_ACCESS_GRANTS (#2264): the entry with why it was approved, and every subscription. */
  waitlistEntry: (email: string) => Promise<StoredWaitlistEntry | undefined>;
  subscriptions: (email: string) => Promise<StoredSubscription[]>;
  /** The account's own plan, bogle_users/{uid}.subscription, where Stripe and Apple write. */
  accountSubscription: (uid: string) => Promise<StoredSubscription | undefined>;
}

/** The gate date: accounts created before it are in. Null when unset or not a date. */
export function gateSince(env: NodeJS.ProcessEnv = process.env): Date | null {
  const raw = env['WAITLIST_GATE_SINCE'];
  const at = raw ? new Date(raw) : null;
  return at && !Number.isNaN(at.getTime()) ? at : null;
}

const docId = (email: string): string =>
  Buffer.from(email).toString('base64').replace(/[/+=]/g, '_');

function db(): Firestore {
  const firestore = getFirestoreDb();
  if (!firestore) throw new Error('Firestore unavailable');
  return firestore;
}

export const firestoreAdmissionStore: AdmissionStore = {
  async waitlistStatus(email) {
    const snap = await db().collection('waitlist').doc(docId(email)).get();
    return snap.exists ? (snap.data()?.status as string | undefined) : undefined;
  },
  async hasActiveSubscription(email) {
    const profile = await db().collection('user_profiles').doc(docId(email)).get();
    if (profile.data()?.subscription?.status === 'active') return true;
    const bogle = await db().collection('bogle_users').where('email', '==', email).limit(1).get();
    return bogle.docs[0]?.data()?.subscription?.status === 'active';
  },
  async accountCreatedAt(uid) {
    const { getFirebaseUserOrThrow } = await import('../services/identity/firebase-auth.js');
    const user = await getFirebaseUserOrThrow(uid);
    return user?.metadata.creationTime ? new Date(user.metadata.creationTime) : null;
  },
  inCohort: async (cohort, uid) => isCohortMember(cohort, uid), // enabled + member (cohort-membership.ts)
  async waitlistEntry(email) {
    const snap = await db().collection('waitlist').doc(docId(email)).get();
    return snap.exists ? (snap.data() as StoredWaitlistEntry | undefined) : undefined;
  },
  async subscriptions(email) {
    const profile = await db().collection('user_profiles').doc(docId(email)).get();
    const bogle = await db().collection('bogle_users').where('email', '==', email).limit(1).get();
    const subs: unknown[] = [profile.data()?.subscription, bogle.docs[0]?.data()?.subscription];
    return subs.filter((s): s is StoredSubscription => !!s && typeof s === 'object');
  },
  async accountSubscription(uid) {
    const sub: unknown = (await db().collection('bogle_users').doc(uid).get()).data()?.subscription;
    return typeof sub === 'object' && sub !== null ? (sub as StoredSubscription) : undefined;
  },
};

const cache = new Map<string, { value: Admission; at: number }>();

export function forgetAdmissionCache(): void {
  cache.clear();
}

export interface AdmissionOptions {
  env?: NodeJS.ProcessEnv;
  store?: AdmissionStore;
  now?: () => number;
}

/** Is this caller let in? See the module doc for the rules. */
export async function isAdmitted(who: Who, opts: AdmissionOptions = {}): Promise<Admission> {
  const env = opts.env ?? process.env;
  if (!waitlistGateOn(env)) return { admitted: true, reason: 'gate-off' };
  const email = who.email?.toLowerCase().trim() || undefined;
  if (isAdminEmail(email, env)) return { admitted: true, reason: 'admin' };

  const now = (opts.now ?? Date.now)();
  const key = `${who.uid}|${email ?? ''}`;
  const hit = cache.get(key);
  if (hit && now - hit.at < ADMISSION_CACHE_TTL_MS) return hit.value;

  const store = opts.store ?? firestoreAdmissionStore;
  const since = gateSince(env);
  const checks: Array<[AdmissionReason, () => Promise<boolean>]> = [
    ['waitlist-approved', async () => !!email && ADMITTED_STATUSES.has((await store.waitlistStatus(email)) ?? '')], // prettier-ignore
    ['active-account', async () => (email ? store.hasActiveSubscription(email) : false)],
    ['existing-account', async () => { const at = since && (await store.accountCreatedAt(who.uid)); return !!at && at < since; }], // prettier-ignore
    ['friends-and-family', async () => store.inCohort(ADMISSION_COHORT, who.uid)],
  ];
  if (durableGrantsActive(env)) checks.splice(0, 2, ...durableGrantChecks(store, who.uid, email));
  const results = await Promise.allSettled(checks.map(async ([, check]) => check()));
  const passed = results.findIndex((r) => r.status === 'fulfilled' && r.value);
  if (passed >= 0) return remember(key, now, { admitted: true, reason: checks[passed]![0] });
  const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
  if (failed.length > 0) {
    log.warn(
      { uid: who.uid.slice(0, 8), error: String(failed[0]!.reason) },
      'Admission check failed: refusing'
    );
    return { admitted: false, reason: 'check-failed' };
  }
  return remember(key, now, { admitted: false, reason: 'not-admitted' });
}

function remember(key: string, at: number, value: Admission): Admission {
  cache.set(key, { value, at });
  return value;
}

/**
 * DURABLE_ACCESS_GRANTS: the two stored-grant rules, counting only grants whose reason lasts.
 * A live paid plan always counts, including the one on the account itself (bogle_users/{uid}).
 */
function durableGrantChecks(
  store: AdmissionStore,
  uid: string,
  email: string | undefined
): Array<[AdmissionReason, () => Promise<boolean>]> {
  let read: Promise<StoredSubscription[]> | undefined; // one read, shared by both rules
  const subs = async (): Promise<StoredSubscription[]> => (read ??= email ? store.subscriptions(email) : Promise.resolve([])); // prettier-ignore
  const stored = async (): Promise<boolean> => (await subs()).some((s) => subscriptionAdmits(s, uid)); // prettier-ignore
  return [
    ['waitlist-approved', async () => !!email && waitlistEntryAdmits(await store.waitlistEntry(email), await subs(), uid)], // prettier-ignore
    ['active-account', async () => (await stored()) || livePaidPlan(await store.accountSubscription(uid))], // prettier-ignore
  ];
}

/**
 * For /api/waitlist/check: an active subscription that lets them in. Flag or gate off: any
 * active one, with no read (main's behaviour). DURABLE_ACCESS_GRANTS: one granted for a reason
 * that ends counts only while the live rules admit them. A failed lookup throws, so the check
 * answers a retryable 500 (fails closed, writes nothing) rather than "you're on the waitlist".
 */
export async function activeGrantAdmits(
  sub: StoredSubscription | undefined,
  who: Who,
  opts: AdmissionOptions = {}
): Promise<boolean> {
  if (!durableGrantsActive(opts.env ?? process.env)) return sub?.status === 'active';
  if (subscriptionAdmits(sub, who.uid)) return true; // a live paid plan, or a reason that lasts
  if (sub?.status !== 'active') return false;
  const admission = await isAdmitted(who, opts);
  if (admission.reason === 'check-failed') throw new Error('Admission re-check failed');
  return admission.admitted;
}

/** What a refused caller sees: warm, the same on every route. */
export function notAdmittedBody(reason: AdmissionReason): Record<string, unknown> {
  return reason === 'check-failed'
    ? { error: 'admission_unavailable', retryable: true, message: "We couldn't check your spot just now. Try again in a moment." } // prettier-ignore
    : { error: 'not_admitted', status: 'pending', waitlisted: true, message: "You're on the list. We'll let you know as soon as your spot opens up." }; // prettier-ignore
}

/**
 * Sends the refusal and returns true when the caller isn't admitted; returns
 * false (sends nothing) when they may continue. Admins (token claim) pass.
 */
export async function refuseUnadmitted(
  who: Who & { isAdmin?: boolean },
  res: ServerResponse,
  opts: AdmissionOptions = {}
): Promise<boolean> {
  if (who.isAdmin) return false;
  const admission = await isAdmitted(who, opts);
  if (admission.admitted) return false;
  log.info({ uid: who.uid.slice(0, 8), reason: admission.reason }, 'Not admitted: refused');
  res.writeHead(admission.reason === 'check-failed' ? 503 : 403, { 'Content-Type': 'application/json' }); // prettier-ignore
  res.end(JSON.stringify(notAdmittedBody(admission.reason)));
  return true;
}

/** For requireAuth routes: Firebase callers go through the gate; service keys and dev mode act for others. */
export async function refuseUnadmittedCaller(
  auth: {
    userId: string;
    authMethod: string;
    isAdmin: boolean;
    email?: string;
    emailVerified?: boolean;
  },
  res: ServerResponse
): Promise<boolean> {
  if (auth.authMethod !== 'firebase') return false;
  const email = auth.emailVerified ? auth.email : undefined;
  return refuseUnadmitted({ uid: auth.userId, email, isAdmin: auth.isAdmin }, res);
}
