/**
 * Third-party processing consent (App Store guideline 5.1.2(i)): the person
 * agreed that their voice and memories are processed by the named outside
 * providers, for one version of the disclosure.
 *
 * One record per person in processing_consent/<uid> (server-only:
 * firestore.rules denies clients by default), keyed by the verified Firebase
 * uid, never one named by a caller. The server record is the authority: the
 * app shows its consent screen when GET answers no consent for the current
 * version. Nothing here refuses service yet; consentCovers() is the check a
 * voice-session start can use later.
 *
 * Withdrawing keeps the record and stamps withdrawnAt; agreeing again clears it.
 * Account deletion removes the record.
 *
 * @module services/processing-consent
 */
import type { Firestore } from '@google-cloud/firestore';
import { getFirestoreDb } from '../utils/firestore-utils.js';

export const PROCESSING_CONSENT_COLLECTION = 'processing_consent';

export type ConsentSource = 'ios' | 'web';

export interface ProcessingConsent {
  uid: string;
  /** The disclosure version the person agreed to (the app's, e.g. "2026-10-18"). */
  version: string;
  /** When they agreed, as the app recorded it (ISO). */
  agreedAt: string;
  /** When the server received it (ISO). */
  recordedAt: string;
  source: ConsentSource;
  /** Set when they withdrew; consent no longer holds. */
  withdrawnAt?: string;
}

export interface ConsentAgreement {
  version: string;
  agreedAt: string;
  source: ConsentSource;
}

const VERSION = /^[A-Za-z0-9._-]{1,32}$/;
/** An agreement clock may run a little ahead of the server's. */
const MAX_CLOCK_SKEW_MS = 5 * 60_000;

/** The body of POST /api/account/processing-consent, or the reason it isn't one. */
export function parseAgreement(
  body: unknown,
  now: Date = new Date()
): { ok: true; agreement: ConsentAgreement } | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  if (typeof b.version !== 'string' || !VERSION.test(b.version)) {
    return { ok: false, error: 'version is required' };
  }
  const agreedAt = typeof b.agreedAt === 'string' ? new Date(b.agreedAt) : null;
  if (!agreedAt || Number.isNaN(agreedAt.getTime())) {
    return { ok: false, error: 'agreedAt must be an ISO time' };
  }
  if (agreedAt.getTime() > now.getTime() + MAX_CLOCK_SKEW_MS) {
    return { ok: false, error: 'agreedAt is in the future' };
  }
  const source = b.source ?? 'ios';
  if (source !== 'ios' && source !== 'web') {
    return { ok: false, error: "source must be 'ios' or 'web'" };
  }
  return {
    ok: true,
    agreement: { version: b.version, agreedAt: agreedAt.toISOString(), source },
  };
}

/** True when the record is a standing agreement to this disclosure version. */
export function consentCovers(record: ProcessingConsent | null, version: string): boolean {
  return record !== null && !record.withdrawnAt && record.version === version;
}

function database(db?: Firestore): Firestore {
  const resolved = db ?? getFirestoreDb();
  if (!resolved) throw new Error('Firestore unavailable');
  return resolved;
}

const ref = (uid: string, db?: Firestore) =>
  database(db).collection(PROCESSING_CONSENT_COLLECTION).doc(uid);

export async function getConsent(uid: string, db?: Firestore): Promise<ProcessingConsent | null> {
  const snap = await ref(uid, db).get();
  return snap.exists ? ((snap.data() as ProcessingConsent | undefined) ?? null) : null;
}

/** Record (or replace) the person's agreement; clears an earlier withdrawal. */
export async function recordConsent(
  uid: string,
  agreement: ConsentAgreement,
  opts: { db?: Firestore; now?: Date } = {}
): Promise<ProcessingConsent> {
  const record: ProcessingConsent = {
    uid,
    ...agreement,
    recordedAt: (opts.now ?? new Date()).toISOString(),
  };
  await ref(uid, opts.db).set(record);
  return record;
}

/** Withdraw: the record stays, stamped withdrawnAt. Null when there was nothing to withdraw. */
export async function withdrawConsent(
  uid: string,
  opts: { db?: Firestore; now?: Date } = {}
): Promise<ProcessingConsent | null> {
  const current = await getConsent(uid, opts.db);
  if (!current) return null;
  if (current.withdrawnAt) return current;
  const withdrawn = { ...current, withdrawnAt: (opts.now ?? new Date()).toISOString() };
  await ref(uid, opts.db).set(withdrawn);
  return withdrawn;
}

/** Account deletion. Throws when it can't, so the sweep reports it. */
export async function eraseConsentFor(uid: string, db?: Firestore): Promise<void> {
  await ref(uid, db).delete();
}
