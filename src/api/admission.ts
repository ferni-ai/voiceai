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
const ADMITTED_STATUSES = new Set(['approved', 'admitted', 'joined']);

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
  const results = await Promise.allSettled(checks.map(([, check]) => check()));
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
