/**
 * "Help shape Ferni" (CALL_CAPTURE_CONSENT, off by default): an adult owner's opt-in to keeping
 * their calls for 120 days, only their own voice and Ferni's, never anyone else's on the line.
 * Only the consent lives here; capture (later work) asks captureConsentHolds first. One
 * server-only record per verified uid in call_capture_consent/<uid>; account deletion erases it
 * and export carries it (platform/user-stores.ts). A withdrawal wins over any agreement that isn't
 * strictly later, askedAt means Ferni never asks twice, and nothing holds after CALL_CAPTURE_UNTIL.
 *
 * @module services/call-capture-consent
 */
import type { DocumentReference, Firestore } from '@google-cloud/firestore';
import { flagOn, type Env } from '../config/env-flag.js';
import { getFirestoreDb } from '../utils/firestore-utils.js';
import { userHeld } from '../utils/minor-care.js';
import { createLogger } from '../utils/safe-logger.js';
import { sharedHeldStrict } from './outreach/minor-care-shared-hold.js';

const log = createLogger({ module: 'call-capture-consent' });

const CALL_CAPTURE_CONSENT_COLLECTION = 'call_capture_consent';
/** The disclosure the spoken ask and the settings switch show. */
export const CAPTURE_DISCLOSURE_DATE = '2026-11-01';
const DEFAULT_UNTIL = '2027-03-01T00:00:00.000Z';

type CaptureSource = 'ios' | 'web' | 'voice';

export interface CallCaptureConsent {
  uid: string;
  /** The agreement, when there is one: absent on a record that only says Ferni asked. */
  version?: string;
  agreedAt?: string;
  recordedAt?: string;
  source?: CaptureSource;
  withdrawnAt?: string;
  /** When Ferni asked on a call (ISO): asked once, never again. */
  askedAt?: string;
}

export type CaptureAgreement = Required<
  Pick<CallCaptureConsent, 'version' | 'agreedAt' | 'source'>
>;

interface Opts {
  db?: Firestore;
  now?: Date;
}

export const captureConsentOn = (env: Env = process.env): boolean =>
  flagOn('CALL_CAPTURE_CONSENT', env);

/** CALL_CAPTURE_UNTIL (an ISO date), or 2027-03-01 when unset or not a date. */
export function captureUntil(env: Env = process.env): Date {
  const until = new Date(env.CALL_CAPTURE_UNTIL?.trim() || DEFAULT_UNTIL);
  return Number.isNaN(until.getTime()) ? new Date(DEFAULT_UNTIL) : until;
}

function ref(uid: string, db?: Firestore): DocumentReference {
  const resolved = db ?? getFirestoreDb();
  if (!resolved) throw new Error('Firestore unavailable');
  return resolved.collection(CALL_CAPTURE_CONSENT_COLLECTION).doc(uid);
}

export async function getCaptureConsent(
  uid: string,
  db?: Firestore
): Promise<CallCaptureConsent | null> {
  const snap = await ref(uid, db).get();
  return snap.exists ? ((snap.data() as CallCaptureConsent | undefined) ?? null) : null;
}

/**
 * The one minor check (the API, the voice tool, captureConsentHolds): the in-process hold
 * (userHeld, MINOR_CARE) or the shared one (sharedHeldStrict, MINOR_CARE_SHARED_HOLD, fail
 * closed). A source whose flag is off holds nobody; a check that throws counts as held.
 */
export async function captureBlockedForMinor(
  uid: string,
  env: Env = process.env
): Promise<boolean> {
  try {
    return userHeld(uid, env) || (await sharedHeldStrict(uid, env));
  } catch (error) {
    log.warn({ error: String(error) }, 'Minor-care hold unreadable: capture blocked');
    return true;
  }
}

/**
 * Whether this person's calls may be kept: flag on, a standing agreement to the current disclosure
 * before the end date, and no minor-care hold now. Unreadable means no.
 */
export async function captureConsentHolds(
  uid: string,
  now: Date = new Date(),
  opts: { db?: Firestore; env?: Env } = {}
): Promise<boolean> {
  const env = opts.env ?? process.env;
  if (!captureConsentOn(env)) return false;
  try {
    const r = await getCaptureConsent(uid, opts.db);
    if (!r?.agreedAt || r.version !== CAPTURE_DISCLOSURE_DATE || r.withdrawnAt) return false;
    return now < captureUntil(env) && !(await captureBlockedForMinor(uid, env));
  } catch (error) {
    log.warn({ error: String(error) }, 'Call capture consent unreadable: treated as none');
    return false;
  }
}

/**
 * Record (or replace) the agreement, keeping askedAt. Null, changing nothing, when a withdrawal
 * is not strictly earlier than agreedAt: a retried or stale request never undoes a "turn it off".
 */
export async function recordCaptureConsent(
  uid: string,
  agreement: CaptureAgreement,
  opts: Opts = {}
): Promise<CallCaptureConsent | null> {
  const current = await getCaptureConsent(uid, opts.db);
  const { withdrawnAt } = current ?? {};
  if (withdrawnAt && !(Date.parse(agreement.agreedAt) > Date.parse(withdrawnAt))) return null;
  const record: CallCaptureConsent = {
    uid,
    ...agreement,
    recordedAt: (opts.now ?? new Date()).toISOString(),
    ...(current?.askedAt ? { askedAt: current.askedAt } : {}),
  };
  await ref(uid, opts.db).set(record);
  return record;
}

/** Stamps withdrawnAt and runs onCaptureWithdrawn; null when there was no agreement. */
export async function withdrawCaptureConsent(
  uid: string,
  opts: Opts = {}
): Promise<CallCaptureConsent | null> {
  const current = await getCaptureConsent(uid, opts.db);
  if (!current?.agreedAt) return null;
  if (current.withdrawnAt) return current;
  const withdrawn = { ...current, withdrawnAt: (opts.now ?? new Date()).toISOString() };
  await ref(uid, opts.db).set(withdrawn);
  onCaptureWithdrawn(uid);
  return withdrawn;
}

/** Ferni asked on a call: stamped once, so it never asks again. */
export async function markCaptureAsked(uid: string, opts: Opts = {}): Promise<void> {
  const current = await getCaptureConsent(uid, opts.db);
  if (current?.askedAt) return;
  const askedAt = (opts.now ?? new Date()).toISOString();
  await ref(uid, opts.db).set({ ...(current ?? { uid }), askedAt });
}

/** Runs on every withdrawal: deleting what was kept goes here. Logs a count, never who. */
export function onCaptureWithdrawn(_uid: string): void {
  log.info({ withdrawn: 1 }, 'Call capture consent withdrawn');
}
