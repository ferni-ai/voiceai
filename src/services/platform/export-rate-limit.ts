/**
 * How often a person may export, held in Firestore so every UI server instance sees the
 * same count (an in-memory limit lets a person spread requests over instances).
 *
 * Keyed by the uid the API server verified, never by IP or a client-sent value. Claimed
 * before any export read; every attempt counts, refused ones too; and one export per
 * person runs at a time, across every instance (a lease that expires if the server dies
 * mid-export). If the store can't be reached the export is refused, never let through.
 * The per-process cap below is the other bound: it protects this instance's memory.
 *
 * @module services/platform/export-rate-limit
 */

import { getFirestore } from 'firebase-admin/firestore';
import { createLogger } from '../../utils/safe-logger.js';
import { ExportLimitError } from './bounded-reader.js';

const log = createLogger({ module: 'export-rate-limit' });

export const EXPORT_RATE = {
  /** Attempts per person per window */
  maxRequests: 3,
  windowMs: 10 * 60_000,
  /** How long one export may hold its person's slot */
  leaseMs: 60_000,
  /** Exports running at once in this process, whoever asks */
  maxConcurrentPerProcess: 3,
};

const COLLECTION = 'export_rate_limits';
let runningHere = 0;

interface RateDoc {
  attempts?: number[];
  runningUntil?: number;
}

/**
 * Claim one export for this uid, or throw ExportLimitError: 'rate' (too many attempts),
 * 'busy' (one is already running for them, or this process is full). Returns the release.
 */
export async function claimExport(
  uid: string,
  firestore?: FirebaseFirestore.Firestore
): Promise<() => Promise<void>> {
  if (!uid || uid.includes('/')) throw new ExportLimitError('rate');
  if (runningHere >= EXPORT_RATE.maxConcurrentPerProcess) throw new ExportLimitError('busy');
  let ref: FirebaseFirestore.DocumentReference | undefined;
  const outcome = await (async () => {
    const db = firestore ?? getFirestore();
    ref = db.collection(COLLECTION).doc(uid);
    return decide(db, ref);
  })().catch((error: unknown) => {
    // Fail closed: if the limit can't be checked, the export doesn't run
    log.error({ error: String(error), uid }, 'Export limit store unreachable; refusing');
    return 'busy' as const;
  });
  if (outcome || !ref) throw new ExportLimitError(outcome ?? 'busy');
  const held = ref;
  runningHere += 1;
  return async () => {
    runningHere -= 1;
    await held.update({ runningUntil: 0 }).catch((error: unknown) => {
      // The lease still expires on its own; log so a stuck slot can be traced
      log.warn({ error: String(error), uid }, 'Failed to release the export slot');
    });
  };
}

/** One transaction: record this attempt, and say whether it's refused and why */
async function decide(
  db: FirebaseFirestore.Firestore,
  ref: FirebaseFirestore.DocumentReference
): Promise<'rate' | 'busy' | null> {
  return db.runTransaction(async (tx) => {
    const now = Date.now();
    const doc = ((await tx.get(ref)).data() ?? {}) as RateDoc;
    const recent = (doc.attempts ?? []).filter((t) => t > now - EXPORT_RATE.windowMs);
    const attempts = [...recent, now].slice(-50); // this attempt counts, allowed or not
    const running = (doc.runningUntil ?? 0) > now;
    const refused = recent.length >= EXPORT_RATE.maxRequests ? 'rate' : running ? 'busy' : null;
    tx.set(ref, {
      attempts,
      runningUntil: refused ? (doc.runningUntil ?? 0) : now + EXPORT_RATE.leaseMs,
    });
    return refused;
  });
}
