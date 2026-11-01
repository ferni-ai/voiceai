/**
 * "Help shape Ferni" (CALL_CAPTURE_CONSENT, off by default): an adult owner's opt-in to keeping
 * full recordings of their calls for 120 days. Only the consent lives here; nothing here records
 * anything. Capture (later work) asks captureConsentHolds before it starts.
 *
 * One record per person in call_capture_consent/<uid> (server-only: firestore.rules denies
 * clients by default), keyed by the verified Firebase uid, never one a caller names. Withdrawing
 * stamps withdrawnAt and runs onCaptureWithdrawn, where deleting what was kept goes. askedAt:
 * Ferni asked on a call, so it never asks again. Account deletion erases the record and the
 * export carries it (platform/user-stores.ts). Consent holds only before CALL_CAPTURE_UNTIL
 * (default 2027-03-01), so the programme ends itself unless it is renewed.
 *
 * @module services/call-capture-consent
 */
import type { DocumentReference, Firestore } from '@google-cloud/firestore';
import { flagOn, type Env } from '../config/env-flag.js';
import { getFirestoreDb } from '../utils/firestore-utils.js';
import { createLogger } from '../utils/safe-logger.js';

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

export interface CaptureAgreement {
  version: string;
  agreedAt: string;
  source: CaptureSource;
}

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

/** A standing agreement, not withdrawn, before the programme's end date. */
function consentHolds(
  record: CallCaptureConsent | null,
  now: Date,
  env: Env = process.env
): boolean {
  return !!record?.agreedAt && !record.withdrawnAt && now < captureUntil(env);
}

function database(db?: Firestore): Firestore {
  const resolved = db ?? getFirestoreDb();
  if (!resolved) throw new Error('Firestore unavailable');
  return resolved;
}

const ref = (uid: string, db?: Firestore): DocumentReference =>
  database(db).collection(CALL_CAPTURE_CONSENT_COLLECTION).doc(uid);

export async function getCaptureConsent(
  uid: string,
  db?: Firestore
): Promise<CallCaptureConsent | null> {
  const snap = await ref(uid, db).get();
  return snap.exists ? ((snap.data() as CallCaptureConsent | undefined) ?? null) : null;
}

/**
 * Whether this person's calls may be kept: flag on, and consentHolds. A record that can't be read
 * means no (capture fails closed).
 */
export async function captureConsentHolds(
  uid: string,
  now: Date = new Date(),
  opts: { db?: Firestore; env?: Env } = {}
): Promise<boolean> {
  const env = opts.env ?? process.env;
  if (!captureConsentOn(env)) return false;
  try {
    return consentHolds(await getCaptureConsent(uid, opts.db), now, env);
  } catch (error) {
    log.warn({ error: String(error) }, 'Call capture consent unreadable: treated as none');
    return false;
  }
}

/** Record (or replace) the agreement; clears a withdrawal, keeps askedAt. */
export async function recordCaptureConsent(
  uid: string,
  agreement: CaptureAgreement,
  opts: Opts = {}
): Promise<CallCaptureConsent> {
  const current = await getCaptureConsent(uid, opts.db);
  const record: CallCaptureConsent = {
    uid,
    ...agreement,
    recordedAt: (opts.now ?? new Date()).toISOString(),
    ...(current?.askedAt ? { askedAt: current.askedAt } : {}),
  };
  await ref(uid, opts.db).set(record);
  return record;
}

/**
 * Withdraw: the record stays, stamped withdrawnAt, and onCaptureWithdrawn runs. Null when there
 * was no agreement to withdraw.
 */
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

/**
 * Runs on every withdrawal. Nothing is captured yet, so it only logs a count (never the uid);
 * deleting the person's captures goes here.
 */
export function onCaptureWithdrawn(_uid: string): void {
  log.info({ withdrawn: 1 }, 'Call capture consent withdrawn');
}
